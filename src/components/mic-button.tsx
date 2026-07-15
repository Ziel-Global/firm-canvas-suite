/**
 * MicButton — reusable microphone trigger component.
 *
 * Props:
 *   onTranscript(text): called with each chunk of recognised text.
 *                       Caller is responsible for appending to their field.
 *   className?: extra classes for the button.
 */

import { cn } from "@/lib/utils";
import { Mic, MicOff, Loader2 } from "lucide-react";
import { useSpeechToText } from "@/hooks/use-speech-to-text";
import { toast } from "sonner";

interface MicButtonProps {
  onTranscript: (text: string) => void;
  className?: string;
  disabled?: boolean;
}

export function MicButton({ onTranscript, className, disabled }: MicButtonProps) {
  const { isListening, isSupported, usingNative, start, stop } = useSpeechToText({
    onTranscript,
  });

  function handleClick() {
    if (!isSupported) {
      toast.error("Your browser does not support voice capture.");
      return;
    }
    if (isListening) {
      stop();
    } else {
      start();
      if (usingNative) {
        toast.info("Listening… speak now. Click the mic again to stop.", { duration: 2500 });
      } else {
        toast.info("Recording audio… click the mic again to stop and transcribe.", { duration: 2500 });
      }
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || !isSupported}
      title={
        !isSupported
          ? "Voice capture not supported in this browser"
          : isListening
          ? "Stop recording"
          : "Dictate text"
      }
      aria-label={isListening ? "Stop voice dictation" : "Start voice dictation"}
      className={cn(
        "inline-flex items-center justify-center rounded-full transition-all",
        "size-8 text-muted-foreground hover:text-foreground hover:bg-muted",
        isListening && "text-destructive animate-pulse bg-destructive/10 hover:bg-destructive/20 hover:text-destructive",
        (!isSupported || disabled) && "opacity-40 cursor-not-allowed",
        className,
      )}
    >
      {isListening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
    </button>
  );
}
