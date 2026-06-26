CREATE TYPE public.user_role AS ENUM ('super_admin', 'admin', 'senior_lawyer', 'junior_lawyer', 'support', 'client');

CREATE TYPE public.case_status AS ENUM ('intake', 'active', 'on_hold', 'closed');

CREATE TYPE public.health_status AS ENUM ('on_track', 'at_risk', 'overdue');

CREATE TYPE public.task_status AS ENUM ('todo', 'in_progress', 'in_review', 'done');

CREATE TYPE public.priority AS ENUM ('low', 'medium', 'high');

CREATE TYPE public.stage_status AS ENUM ('pending', 'active', 'complete', 'returned');

CREATE TYPE public.approval_status AS ENUM ('pending', 'approved', 'returned', 'locked');