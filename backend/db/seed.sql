INSERT INTO workers (
  id,
  worker_code,
  name,
  trade,
  city,
  contact_phone,
  contact_email,
  photo_url,
  languages,
  trust_score,
  jobs_completed,
  years_experience,
  summary
)
VALUES
  (
    '11111111-1111-1111-1111-111111111111',
    'WK-1001',
    'Ramesh Patil',
    'Electrician',
    'Pune',
    '+91-9000000001',
    'ramesh.worker@rv5.local',
    'https://images.unsplash.com/photo-1607746882042-944635dfe10e?w=300',
    ARRAY['Marathi', 'Hindi'],
    87,
    132,
    8,
    'Residential and small commercial wiring specialist.'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'WK-1002',
    'Shankar Jadhav',
    'Plumber',
    'Kolhapur',
    '+91-9000000002',
    'shankar.worker@rv5.local',
    'https://images.unsplash.com/photo-1547425260-76bcadfb4f2c?w=300',
    ARRAY['Marathi'],
    81,
    98,
    6,
    'Leak repairs, bathroom fitting and emergency water-line fixes.'
  )
ON CONFLICT (id)
DO UPDATE SET
  worker_code = EXCLUDED.worker_code,
  name = EXCLUDED.name,
  trade = EXCLUDED.trade,
  city = EXCLUDED.city,
  contact_phone = EXCLUDED.contact_phone,
  contact_email = EXCLUDED.contact_email,
  photo_url = EXCLUDED.photo_url,
  languages = EXCLUDED.languages,
  trust_score = EXCLUDED.trust_score,
  jobs_completed = EXCLUDED.jobs_completed,
  years_experience = EXCLUDED.years_experience,
  summary = EXCLUDED.summary,
  updated_at = now();

INSERT INTO worker_badges (worker_id, badge)
VALUES
  ('11111111-1111-1111-1111-111111111111', 'Verified ID'),
  ('11111111-1111-1111-1111-111111111111', 'Skill Test Level 2'),
  ('11111111-1111-1111-1111-111111111111', 'On-time 95%'),
  ('22222222-2222-2222-2222-222222222222', 'Verified ID'),
  ('22222222-2222-2222-2222-222222222222', 'Customer Favorite')
ON CONFLICT DO NOTHING;

INSERT INTO recruiters (
  id,
  company_name,
  contact_name,
  city,
  verified
)
VALUES
  ('33333333-3333-3333-3333-333333333333', 'UrbanFix Services', 'Neha Kulkarni', 'Pune', true),
  ('44444444-4444-4444-4444-444444444444', 'Rapid Home Assist', 'Amit More', 'Kolhapur', false)
ON CONFLICT (id)
DO UPDATE SET
  company_name = EXCLUDED.company_name,
  contact_name = EXCLUDED.contact_name,
  city = EXCLUDED.city,
  verified = EXCLUDED.verified,
  updated_at = now();

INSERT INTO jobs (
  id,
  recruiter_id,
  assigned_worker_id,
  title,
  city,
  required_trade,
  budget,
  description,
  status
)
VALUES
  (
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    NULL,
    'House wiring repair',
    'Pune',
    'Electrician',
    1800,
    '2BHK apartment full circuit troubleshooting and socket replacement.',
    'open'
  ),
  (
    '66666666-6666-6666-6666-666666666666',
    '44444444-4444-4444-4444-444444444444',
    '22222222-2222-2222-2222-222222222222',
    'Bathroom leakage fix',
    'Kolhapur',
    'Plumber',
    1200,
    'Pipe joint leakage and seal replacement needed urgently.',
    'assigned'
  )
ON CONFLICT (id)
DO UPDATE SET
  recruiter_id = EXCLUDED.recruiter_id,
  assigned_worker_id = EXCLUDED.assigned_worker_id,
  title = EXCLUDED.title,
  city = EXCLUDED.city,
  required_trade = EXCLUDED.required_trade,
  budget = EXCLUDED.budget,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = now();

INSERT INTO app_users (
  id,
  role,
  identifier,
  password_hash,
  worker_id,
  recruiter_id,
  is_active
)
VALUES
  (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    'admin',
    'admin',
    encode(digest('admin123', 'sha256'), 'hex'),
    NULL,
    NULL,
    true
  ),
  (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'worker',
    'worker_ramesh',
    encode(digest('worker123', 'sha256'), 'hex'),
    '11111111-1111-1111-1111-111111111111',
    NULL,
    true
  ),
  (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'worker',
    'worker_shankar',
    encode(digest('worker123', 'sha256'), 'hex'),
    '22222222-2222-2222-2222-222222222222',
    NULL,
    true
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    'recruiter',
    'recruiter_urban',
    encode(digest('recruiter123', 'sha256'), 'hex'),
    NULL,
    '33333333-3333-3333-3333-333333333333',
    true
  )
ON CONFLICT (identifier)
DO UPDATE SET
  role = EXCLUDED.role,
  password_hash = EXCLUDED.password_hash,
  worker_id = EXCLUDED.worker_id,
  recruiter_id = EXCLUDED.recruiter_id,
  is_active = EXCLUDED.is_active,
  updated_at = now();

INSERT INTO notifications (title, message, level, target_role, entity_type, entity_id)
SELECT
  'Platform initialized',
  'Admin, worker accounts, and seed jobs are ready.',
  'success',
  'all',
  'system',
  'bootstrap'
WHERE NOT EXISTS (
  SELECT 1 FROM notifications WHERE title = 'Platform initialized' AND entity_id = 'bootstrap'
);
