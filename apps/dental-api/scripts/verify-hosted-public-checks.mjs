const tables = ['clinic_memberships', 'clinics', 'inquiries', 'patient_account_links', 'patients', 'profiles'];

async function responseCode(response) {
  try {
    return (await response.json()).code;
  } catch {
    return undefined;
  }
}

export async function verifyAnonymousSurface(request) {
  const checks = [];
  const settingsResponse = await request('/auth/v1/settings');
  let settings;
  if (settingsResponse.status === 200) {
    try {
      settings = await settingsResponse.json();
    } catch {
      settings = undefined;
    }
  }
  checks.push({ label: 'Auth settings endpoint', passed: settingsResponse.status === 200, detail: `HTTP ${settingsResponse.status}` });
  checks.push({ label: 'email/password provider enabled', passed: settings?.external?.email === true });
  checks.push({ label: 'email confirmation required', passed: settings?.mailer_autoconfirm === false });

  const reads = await Promise.all(tables.map(async table => {
    const response = await request(`/rest/v1/${table}?select=*&limit=1`);
    const code = await responseCode(response);
    return {
      label: `anonymous ${table} read denied`,
      passed: response.status === 401 && code === '42501',
      detail: `HTTP ${response.status}${code ? ` / ${code}` : ''}`,
    };
  }));

  const roster = await request('/rest/v1/rpc/team_roster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_clinic_id: '00000000-0000-4000-8000-000000000000' }),
  });
  const rosterCode = await responseCode(roster);
  checks.push(...reads, {
    label: 'anonymous team_roster RPC denied',
    passed: roster.status === 401 && rosterCode === '42501',
    detail: `HTTP ${roster.status}${rosterCode ? ` / ${rosterCode}` : ''}`,
  });
  return checks;
}
