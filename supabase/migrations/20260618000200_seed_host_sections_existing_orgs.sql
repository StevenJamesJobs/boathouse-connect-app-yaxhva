-- Seed the OpenTable Academy default section for all existing orgs (idempotent).
SELECT public.seed_org_host_sections(id) FROM public.organizations;

-- Preserve McLoone's exact production copy (keep the cmacula completion bullet).
UPDATE public.host_sections
SET instructions = E'Please select a course below, and login into your OpenTable Academy Account to complete each course.\nIf you do not have an account, please register and login to start the courses.\nCourses range from 30 - 60 minutes, but are not timed and can be completed at your own pace.\nWhen completed forward the email of completion and certificate to cmacula@mcloones.com'
WHERE organization_id = '7f9a6397-135a-40c2-849d-6109ef93f6a6' AND system_key = 'opentable_academy';
