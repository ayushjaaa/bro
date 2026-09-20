import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function main() {
  const { data: customer, error: custErr } = await supabase
    .from('customers')
    .select('id, first_name, last_name, email, account_type')
    .eq('email', 'test.wholesaler@example.com')
    .maybeSingle();

  console.log('customer:', JSON.stringify(customer, null, 2), custErr);

  if (customer) {
    const { data: cart, error: cartErr } = await supabase
      .from('cart_snapshot')
      .select('*')
      .eq('customer_id', customer.id);
    console.log('cart_snapshot:', JSON.stringify(cart, null, 2), cartErr);
  }
}
main();
