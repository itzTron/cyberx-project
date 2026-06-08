require('dotenv').config({ path: 'server/.env' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log("Checking pending_account_actions table...");
  const { data, error } = await supabase.from('pending_account_actions').select('*').limit(1);
  if (error) {
    console.error("Error fetching from pending_account_actions:", error);
  } else {
    console.log("Successfully fetched from pending_account_actions. Row sample:", data);
  }

  // Check columns by inspecting response metadata or testing insertion
  console.log("\nAttempting to check columns via SQL...");
  const { data: cols, error: colError } = await supabase.rpc('get_table_columns', { table_name: 'pending_account_actions' });
  if (colError) {
    console.log("RPC get_table_columns not available, attempting a mock insert to check columns...");
    // Let's insert a mock record to see if it fails due to missing columns or database issues.
    const mockAction = {
      user_id: 'test_user_id',
      user_email: 'test@example.com',
      action_type: 'disable',
      confirm_token: 'test_confirm_token_' + Date.now(),
      cancel_token: 'test_cancel_token_' + Date.now(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    };
    
    console.log("Inserting mock record:", mockAction);
    const { data: insData, error: insError } = await supabase.from('pending_account_actions').insert(mockAction).select();
    if (insError) {
      console.error("Insert failed:", insError);
    } else {
      console.log("Insert succeeded!", insData);
      // Clean up mock
      await supabase.from('pending_account_actions').delete().eq('confirm_token', mockAction.confirm_token);
      console.log("Cleaned up mock record.");
    }
  } else {
    console.log("Columns:", cols);
  }
}

check().catch(console.error);
