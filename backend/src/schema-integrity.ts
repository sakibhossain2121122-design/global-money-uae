import type { PoolClient } from 'pg';

/** Structural catalog signature; excludes data, ownership and ACLs (checked separately).
 * pg_catalog deparsing runs with an empty search path so schema qualification is stable.
 */
export async function schemaSignature(client: PoolClient, schema: string): Promise<string[]> {
  const oldPath = (await client.query('SHOW search_path')).rows[0].search_path;
  await client.query("SELECT set_config('search_path','pg_catalog',true)");
  try {
    const result = await client.query(`
      SELECT jsonb_build_array('relation',c.relname,c.relkind,c.relpersistence,c.relrowsecurity,c.relforcerowsecurity)::text AS signature
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
      UNION ALL
      SELECT jsonb_build_array('column',c.relname,a.attname,a.attnum,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid))::text
      FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum
      WHERE n.nspname=$1 AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','S')
      UNION ALL
      SELECT jsonb_build_array('constraint',c.relname,k.conname,k.convalidated,pg_get_constraintdef(k.oid,false))::text
      FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
      UNION ALL
      SELECT jsonb_build_array('index',c.relname,i.indisvalid,i.indisready,pg_get_indexdef(i.indexrelid))::text
      FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
      UNION ALL
      SELECT jsonb_build_array('trigger',c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,false))::text
      FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND NOT t.tgisinternal
      UNION ALL
      SELECT jsonb_build_array('function',p.proname,pg_get_functiondef(p.oid))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=$1
      UNION ALL
      SELECT jsonb_build_array('sequence',c.relname,s.seqtypid,s.seqstart,s.seqincrement,s.seqmax,s.seqmin,s.seqcache,s.seqcycle)::text
      FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1
    `, [schema]);
    return result.rows.map(r => String(r.signature).replaceAll(schema + '.', '<schema>.').replaceAll('"' + schema + '".', '<schema>.')).sort();
  } finally {
    await client.query("SELECT set_config('search_path',$1,true)", [oldPath]);
  }
}
