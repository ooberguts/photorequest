import { readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';

// Generate the public schema from the same validator used to open orders.
const source = await readFile(new URL('../src/lib/model.ts', import.meta.url), 'utf8');
const compiled = ts
  .transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  })
  .outputText.replace(/from ['"]zod['"]/, `from ${JSON.stringify(import.meta.resolve('zod'))}`);
const { manifestSchema } = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);
const schema = {
  ...z.toJSONSchema(manifestSchema),
  $id: 'urn:photorequest:order:v1',
  title: 'PhotoRequest order v1',
};
const output = `${JSON.stringify(schema, null, 2)}\n`;
const dest = new URL('../schema/order-v1.schema.json', import.meta.url);
if (process.argv.includes('--check')) {
  if ((await readFile(dest, 'utf8')) !== output)
    throw new Error('Order schema is out of date. Run npm run schema.');
  console.log('Order JSON Schema matches the application validator.');
} else {
  await mkdir(new URL('../schema', import.meta.url), { recursive: true });
  await writeFile(dest, output);
  console.log('Generated schema/order-v1.schema.json');
}
