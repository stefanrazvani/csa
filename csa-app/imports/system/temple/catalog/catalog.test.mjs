import assert from 'node:assert/strict';
import { getImplementationCatalog } from './index.js';

for (const grade of [1, 2, 3]) {
  const catalog = getImplementationCatalog({ grade });
  assert.equal(catalog.grade, grade);
  assert.ok(catalog.symbols.length > 0);
  assert.ok(catalog.symbols.every((symbol) => symbol.grade === grade));
  assert.ok(catalog.symbols.every((symbol) => symbol.optional !== true));
}

const requestedButUnreleased = getImplementationCatalog({
  grade: 1,
  enabledOptionalSymbolIds: ['g1-seasonal-circle'],
});
assert.equal(requestedButUnreleased.symbols.some((symbol) => symbol.id === 'g1-seasonal-circle'), false);

const noOffice = getImplementationCatalog({ grade: 3, officeCodes: [] });
assert.equal(noOffice.officers.length, 0);
const secretary = getImplementationCatalog({ grade: 3, officeCodes: ['secretary'] });
assert.ok(secretary.officers.some((office) => office.code === 'secretary'));

console.log('catalog editorial/ACL: ok');
