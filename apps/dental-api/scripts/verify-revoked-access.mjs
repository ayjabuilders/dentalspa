// Never include bearer tokens or provider response bodies in verification output.
export async function verifyRevokedAccess({ requestApi, requestData, patientId, clinicId }) {
  const checks = [
    ['revoked access token cannot resolve workspace', () => requestApi('/me/workspace'), r => r.status === 401],
    ['revoked access token cannot read patient', () => requestApi(`/patients/${encodeURIComponent(patientId)}`), r => r.status === 401],
    ['revoked session RPC returns false', () => requestData('rpc/is_current_session_active', {}), async r => r.status === 200 && await r.json() === false],
    ['revoked access token cannot read patient table', () => requestData(`patients?select=id&id=eq.${encodeURIComponent(patientId)}`), async r => {
      if (r.status !== 200) return false;
      const rows = await r.json();
      return Array.isArray(rows) && rows.length === 0;
    }],
    ['revoked access token cannot invoke intake RPC', () => requestData('rpc/list_inquiries', { p_clinic_id: clinicId }), async r =>
      [401, 403].includes(r.status) && (await r.json()).code === '28000'],
  ];
  const results = [];
  for (const [label, request, accepts] of checks) {
    try {
      const response = await request();
      results.push({ label, passed: await accepts(response), status: response.status });
    } catch {
      results.push({ label, passed: false, status: null });
    }
  }
  return results;
}
