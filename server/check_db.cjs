require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
  console.log("Checking pending_account_actions table (basic columns)...");
  
  // Try querying only the basic columns from the first migration
  const { data, error } = await supabase
    .from('pending_account_actions')
    .select('id, user_id, user_email, action_type, confirm_token, status, requested_from, expires_at, created_at')
    .limit(1);

  if (error) {
    console.error("Query failed for basic columns:", error);
  } else {
    console.log("Basic columns query succeeded! Row sample:", data);
  }

  // Try querying the new columns specifically
  console.log("\nChecking cancel_token column...");
  const { data: cancelData, error: cancelError } = await supabase
    .from('pending_account_actions')
    .select('cancel_token')
    .limit(1);
  if (cancelError) {
    console.error("Querying cancel_token failed:", cancelError.message);
  } else {
    console.log("Querying cancel_token succeeded!", cancelData);
  }

  console.log("\nChecking password_verified_at column...");
  const { data: pvData, error: pvError } = await supabase
    .from('pending_account_actions')
    .select('password_verified_at')
    .limit(1);
  if (pvError) {
    console.error("Querying password_verified_at failed:", pvError.message);
  } else {
    console.log("Querying password_verified_at succeeded!", pvData);
  }
}

check().catch(console.error);
