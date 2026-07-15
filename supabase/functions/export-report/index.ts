import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const body = await req.json();
    const { format, reportData, title } = body as {
      format: "pdf" | "excel";
      reportData: any[];
      title: string;
    };

    if (format === "excel") {
      // Generate CSV
      if (!reportData || reportData.length === 0) {
        return new Response("No data", { status: 400 });
      }

      const headers = Object.keys(reportData[0]);
      const csvRows = [headers.join(",")];
      
      for (const row of reportData) {
        const values = headers.map(header => {
          const val = row[header];
          const str = (val === null || val === undefined) ? "" : String(val);
          return `"${str.replace(/"/g, '""')}"`;
        });
        csvRows.push(values.join(","));
      }
      const csvString = csvRows.join("\n");
      
      return new Response(csvString, {
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, '_')}.csv"`,
        },
      });
    }

    if (format === "pdf") {
      const pdfDoc = await PDFDocument.create();
      const page = pdfDoc.addPage();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      
      const { width, height } = page.getSize();
      
      page.drawText(title, {
        x: 50,
        y: height - 50,
        size: 20,
        font: boldFont,
        color: rgb(0, 0, 0),
      });

      let yOffset = height - 90;
      
      if (!reportData || reportData.length === 0) {
        page.drawText("No data available.", {
          x: 50,
          y: yOffset,
          size: 12,
          font,
        });
      } else {
        const headers = Object.keys(reportData[0]);
        // Simple text-based table
        page.drawText(headers.join(" | "), {
          x: 50,
          y: yOffset,
          size: 10,
          font: boldFont,
        });
        
        yOffset -= 20;
        
        for (const row of reportData) {
          if (yOffset < 50) {
            // Very basic pagination handling
            // Normally you would add a new page here, keeping it simple for the placeholder
            page.drawText("... (more rows truncated)", { x: 50, y: yOffset, size: 10, font });
            break;
          }
          const rowText = headers.map(h => String(row[h] ?? "")).join(" | ");
          page.drawText(rowText, {
            x: 50,
            y: yOffset,
            size: 10,
            font,
          });
          yOffset -= 15;
        }
      }

      const pdfBytes = await pdfDoc.save();
      
      return new Response(pdfBytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${title.replace(/\s+/g, '_')}.pdf"`,
        },
      });
    }

    throw new Error("Invalid format");

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
