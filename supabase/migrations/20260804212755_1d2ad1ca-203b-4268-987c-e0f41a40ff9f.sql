GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_user_email() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_own_student(uuid) TO authenticated, service_role;