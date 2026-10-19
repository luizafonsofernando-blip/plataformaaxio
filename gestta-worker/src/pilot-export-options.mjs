// Primeiro ensaio XLSX de outubro. Nao equivale a cobertura global.
import {parseSingleExportOptions} from './export-test-guards.mjs';

export const PILOT_EXPECTED_RENDERED_USERS=596;

export function parsePilotExportOptions(args){
  const flag='--confirm-rendered-users-only';
  if(!Array.isArray(args) || args.filter(x=>x===flag).length!==1){
    throw new Error('Piloto exige --confirm-rendered-users-only e --confirm-download explicitamente.');
  }
  const options=parseSingleExportOptions(args.filter(x=>x!==flag));
  return {...options,expectedRenderedUsers:PILOT_EXPECTED_RENDERED_USERS};
}
