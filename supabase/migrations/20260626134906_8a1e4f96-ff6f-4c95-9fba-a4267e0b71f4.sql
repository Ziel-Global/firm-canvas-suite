CREATE TABLE public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID REFERENCES public.cases(id),
  title TEXT NOT NULL,
  description TEXT,
  assignee_id UUID REFERENCES public.profiles(id),
  status public.task_status DEFAULT 'todo',
  priority public.priority DEFAULT 'medium',
  start_date DATE,
  due_date DATE,
  stage_id UUID,
  sort_order INT DEFAULT 0,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE public.task_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  label TEXT,
  color TEXT
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.tasks TO authenticated;
GRANT ALL ON public.tasks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.task_tags TO authenticated;
GRANT ALL ON public.task_tags TO service_role;

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view tasks" ON public.tasks FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert tasks" ON public.tasks FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update tasks" ON public.tasks FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete tasks" ON public.tasks FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));

CREATE POLICY "Staff can view task tags" ON public.task_tags FOR SELECT TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can insert task tags" ON public.task_tags FOR INSERT TO authenticated WITH CHECK (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can update task tags" ON public.task_tags FOR UPDATE TO authenticated USING (public.is_active_staff(auth.uid()));
CREATE POLICY "Staff can delete task tags" ON public.task_tags FOR DELETE TO authenticated USING (public.is_active_staff(auth.uid()));