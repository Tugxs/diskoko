// Repair only an unambiguous model shorthand; customer-uploaded source is untouched.
export function generatedCommandSource(source) {
  if(typeof source!=='string')return source;
  let result=source.trim().replace(/^```(?:javascript|js)?\s*/,'').replace(/\s*```$/,'');
  if(/^handle\s*\(/.test(result))result='function '+result;
  return result;
}
