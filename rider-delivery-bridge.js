// Add/call this from the existing Rider app whenever the rider accepts or changes delivery status.
// It connects the existing rider job to the market order delivery tracker.
//
// status values:
// accepted | pickup_started | picked_up | delivering | completed | cancelled
//
// db = existing Supabase client in the Rider app.
async function syncMarketDeliveryStatus(jobId, status, riderName, riderPhone) {
  const { data, error } = await db.rpc('market_rider_update_delivery_batch', {
    p_rider_job_id: jobId,
    p_status: status,
    p_rider_name: riderName || null,
    p_rider_phone: riderPhone || null
  });
  if (error && !String(error.message||'').includes('ไม่พบงานจัดส่ง')) {
    console.warn('market delivery sync failed', error);
  }
  return data;
}
