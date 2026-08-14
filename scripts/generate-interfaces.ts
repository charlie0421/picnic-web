import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// (no hardcoded Json or Enums; everything is generated from supabase.ts)

function log(message: string) {
  process.stdout.write(message + '\n');
}

function toPascalCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

function toCamelCase(str: string): string {
  const p = toPascalCase(str);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

function buildEnumTypeName(enumKey: string): string {
  const base = enumKey.endsWith('_enum') ? enumKey.replace(/_enum$/, '') : enumKey;
  const name = toPascalCase(base);
  // _type, _status는 자연스러운 접미사를 유지, 그 외에는 Enum을 붙여 충돌 방지
  return name.endsWith('Type') || name.endsWith('Status') ? name : `${name}Enum`;
}

function generateInterfaces() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);

  log('🔍 Supabase 타입 파일을 읽는 중...');
  const fileContent = fs.readFileSync(path.join(__dirname, '../types/supabase.ts'), 'utf-8');
  const interfaces: string[] = [];

  // 1) Enums 자동 추출 (Constants.public.Enums 사용)
  log('🧭 Enums 자동 추출 중...');
  const enumsSectionMatch = fileContent.match(/export const Constants\s*=\s*\{[\s\S]*?public:\s*\{[\s\S]*?Enums:\s*\{([\s\S]*?)\}[\s\S]*?\}[\s\S]*?\}\s*as const/);
  const enumKeyToValues: Record<string, string[]> = {};
  if (enumsSectionMatch) {
    const enumsBody = enumsSectionMatch[1];
    const enumRegex = /(\w+):\s*\[([\s\S]*?)\]\s*,?/g;
    let em;
    while ((em = enumRegex.exec(enumsBody)) !== null) {
      const key = em[1];
      const raw = em[2];
      const values = raw
        .split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => v.replace(/^[\"\']|[\"\']$/g, ''));
      enumKeyToValues[key] = values;
    }
  } else {
    log('⚠️  Constants.public.Enums 블록을 찾지 못했습니다. 기존 수동 Enum만 사용합니다.');
  }

  log('📝 Json 타입 정의 추가 중...');
  // Add Json type definition
  interfaces.push(`export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];`);

  log('📝 Enum 타입 정의 추가 중...');
  // 2) Supabase Enums로부터 100% 동적 생성
  const emittedEnumNames = new Set<string>();
  Object.entries(enumKeyToValues).forEach(([key, values]) => {
    const typeName = buildEnumTypeName(key);
    interfaces.push(`export type ${typeName} = ${values.map(v => `"${v}"`).join(' | ')};`);
    emittedEnumNames.add(typeName);
    // 과거 호환: key가 _enum으로 끝나지 않는 경우, 관용적으로 접미사 없이 쓴 타입 별칭 제공
    // 예) supported_language -> SupportedLanguageEnum + alias SupportedLanguage
    if (!/_enum$/.test(key) && /Enum$/.test(typeName)) {
      const alias = typeName.replace(/Enum$/, '');
      if (!emittedEnumNames.has(alias)) {
        interfaces.push(`export type ${alias} = ${typeName};`);
        emittedEnumNames.add(alias);
      }
    }
  });

  log('🔍 테이블/뷰 인터페이스 생성 중...');
  // Extract table/view names and their Row types
  const tableRegex = /(\w+):\s*{\s*Row:\s*{([\s\S]*?)}\s*[\n\r]+\s*(Insert|Relationships)/g;
  let match;
  let tableCount = 0;

  // 동적 외래키 관계 수집 (forward-only)
  const fkMap: Record<string, Array<{ table: string; isArray: boolean }>> = {};
  const relBlockRegex = /(\w+):\s*{[\s\S]*?Relationships:\s*\[([\s\S]*?)\][\s\S]*?}/g;
  let rm;
  while ((rm = relBlockRegex.exec(fileContent)) !== null) {
    const fromTable = toPascalCase(rm[1]);
    const relBody = rm[2];
    const refRegex = /referencedRelation:\s*"(\w+)"/g;
    let r;
    while ((r = refRegex.exec(relBody)) !== null) {
      const toTable = toPascalCase(r[1]);
      fkMap[fromTable] ||= [];
      fkMap[fromTable].push({ table: toTable, isArray: false });
    }
  }

  // Enums 치환 매핑 준비 (동적)
  const enumReplacement: Array<[RegExp, string]> = Object.keys(enumKeyToValues).flatMap(key => {
    const primary = buildEnumTypeName(key);
    const list: Array<[RegExp, string]> = [[
      new RegExp(`Database\\["public"\\]\\["Enums"\\]\\["${key}"\\]`, 'g'),
      primary,
    ]];
    // 별칭 매핑도 함께 치환 (예: SupportedLanguage)
    if (!/_enum$/.test(key) && /Enum$/.test(primary)) {
      const alias = primary.replace(/Enum$/, '');
      list.push([
        new RegExp(`Database\\["public"\\]\\["Enums"\\]\\["${key}"\\]`, 'g'),
        alias,
      ]);
    }
    return list;
  });

  while ((match = tableRegex.exec(fileContent)) !== null) {
    const tableName = match[1];
    const pascalCaseTableName = toPascalCase(tableName);
    const rowContent = match[2];
    tableCount++;

    log(`📦 ${pascalCaseTableName} 인터페이스 생성 중 (${tableCount}번째)...`);

    // Parse fields
    const fields = rowContent
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => {
        const [name, ...rest] = line.split(':');
        const type = rest.join(':').trim();
        let processedType = type.replace(/;$/, '').trim();
        enumReplacement.forEach(([re, to]) => {
          processedType = processedType.replace(re, to);
        });
        return `  ${name.trim()}: ${processedType}`;
      });

    // Generate interface with FK forward fields
    let allFields = [...fields];
    const fk = fkMap[pascalCaseTableName] || [];
    fk.forEach(({ table, isArray }) => {
      const fieldName = toCamelCase(table);
      allFields.push(`  ${fieldName}?: ${table}${isArray ? '[]' : ''};`);
    });

    const interfaceContent = `export interface ${pascalCaseTableName} {\n${allFields.join('\n')}\n}`;
    interfaces.push(interfaceContent);
  }

  log(`✅ 총 ${tableCount}개의 테이블/뷰 인터페이스 생성 완료`);
  log('📝 인터페이스 파일 작성 중...');

  // Write to file
  const body = interfaces.join('\n\n');
  // Enums 는 위에서 로컬 별칭으로 치환되지만, CompositeTypes 처럼 매핑되지 않은
  // Database[...] 참조는 그대로 남는다. 남아 있으면 supabase.ts 에서 타입을 가져와야
  // interfaces.ts 가 단독으로 컴파일된다 (없으면 TS2304: Cannot find name 'Database').
  const needsDatabaseImport = /\bDatabase\["public"\]/.test(body);
  const header =
    '// Auto-generated interfaces from Supabase types\n\n' +
    (needsDatabaseImport ? "import type { Database } from './supabase';\n\n" : '');
  const output = header + body;
  fs.writeFileSync(path.join(__dirname, '../types/interfaces.ts'), output);
  log('✨ 인터페이스 파일 작성 완료');
}

log('🚀 인터페이스 생성 시작');
generateInterfaces();
log('✨ 인터페이스 생성 완료'); 