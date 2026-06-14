-- Tag photos with the survey issue (SurveyIssueKey) they were captured for during a property
-- viewing, so on-site photos can be grouped and analysed per issue.
ALTER TABLE public.photos ADD COLUMN issue_key TEXT;
