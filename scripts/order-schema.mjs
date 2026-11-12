import { readFile, writeFile, mkdir } from 'node:fs/promises';
import ts from 'typescript';
import { z } from 'zod';
import { format, resolveConfig } from 'prettier';

// Generate both public schemas from the validators used by the application.
function compile(source) {
  return ts
    .transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    })
    .outputText.replace(/from ['"]zod['"]/, `from ${JSON.stringify(import.meta.resolve('zod'))}`);
}
const paperCode = compile(await readFile(new URL('../src/lib/papers.ts', import.meta.url), 'utf8'));
const paperUrl = `data:text/javascript;base64,${Buffer.from(paperCode).toString('base64')}`;
const modelCode = compile(
  await readFile(new URL('../src/lib/model.ts', import.meta.url), 'utf8'),
).replace(/from ['"]\.\/papers['"]/, `from ${JSON.stringify(paperUrl)}`);
const { manifestSchema } = await import(
  `data:text/javascript;base64,${Buffer.from(modelCode).toString('base64')}`
);
const { paperCatalogSchema } = await import(paperUrl);
for (const [name, validator, title, id] of [
  ['order-v1', manifestSchema, 'PhotoRequest order v1', 'urn:photorequest:order:v1'],
  [
    'paper-catalog-v1',
    paperCatalogSchema,
    'PhotoRequest paper catalog v1',
    'urn:photorequest:paper-catalog:v1',
  ],
]) {
  const output = await format(
    JSON.stringify({ ...z.toJSONSchema(validator, { io: 'input' }), $id: id, title }),
    {
      ...(await resolveConfig(new URL('../.prettierrc.json', import.meta.url))),
      parser: 'json',
    },
  );
  const dest = new URL(`../schema/${name}.schema.json`, import.meta.url);
  if (process.argv.includes('--check')) {
    if ((await readFile(dest, 'utf8')) !== output)
      throw new Error(`${name} schema is out of date. Run npm run schema.`);
    console.log(`${name} JSON Schema matches the application validator.`);
  } else {
    await mkdir(new URL('../schema', import.meta.url), { recursive: true });
    await writeFile(dest, output);
    console.log(`Generated schema/${name}.schema.json`);
  }
}
