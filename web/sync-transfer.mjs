export const SYNC_CSV_COLUMNS = Object.freeze([
  'id','date','dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus',
  'displayedNet','finalAdjustment','note','createdAt','updatedAt','legacyReading'
]);

export function syncBundle(state) {
  return {
    type:'courier-sync-v1', schemaVersion:6,
    entries:state.entries,
    closures:state.closures,
    settings:state.settings
  };
}

export function syncCsv(state) {
  const rows=[SYNC_CSV_COLUMNS.map(csvCell).join(',')];
  for(const entry of state.entries)rows.push(SYNC_CSV_COLUMNS.map(key=>csvCell(entry[key])).join(','));
  return rows.join('\r\n')+'\r\n';
}

function csvCell(value) {
  let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
  if(text.startsWith("'"))text="'"+text;
  else if(/^[\u0000-\u0020]*[=+\-@]/.test(text))text="'"+text;
  return `"${text.replaceAll('"','""')}"`;
}

export function parseSyncCsv(input) {
  if(typeof input!=='string'||input.length>8_000_000)throw new Error('CSV-файл пустой или больше 8 МБ.');
  const rows=parseRows(input.replace(/^\uFEFF/,''));
  if(!rows.length||rows.length>10_001)throw new Error('В CSV нет записей или их больше 10 000.');
  if(rows[0].length!==SYNC_CSV_COLUMNS.length||rows[0].some((v,i)=>v!==SYNC_CSV_COLUMNS[i]))
    throw new Error('Проверьте заголовки CSV-файла. Нужна выгрузка «CSV записей» из приложения.');
  const entries=rows.slice(1).filter(row=>row.some(value=>value!==''));
  if(entries.length>10_000)throw new Error('В CSV больше 10 000 записей.');
  return {
    schemaVersion:6,
    entries:entries.map(values=>{
      if(values.length!==SYNC_CSV_COLUMNS.length)throw new Error('В CSV найдена строка с неполным числом столбцов.');
      const row=Object.fromEntries(SYNC_CSV_COLUMNS.map((key,index)=>[key,unprotect(values[index])]));
      for(const key of ['dailyHours','dailyOrders','reward','tax','parkCommission','tips','separateBonus','displayedNet','finalAdjustment'])
        if(row[key]==='')row[key]=null;
      if(row.legacyReading==='')delete row.legacyReading;
      else try{row.legacyReading=JSON.parse(row.legacyReading);}catch{throw new Error(`Не удалось прочитать прежние показания у записи ${row.id||'без ID'}.`);}
      return row;
    })
  };
}

function unprotect(value) {
  if(value.startsWith("''"))return value.slice(1);
  return /^'[\u0000-\u0020]*[=+\-@]/.test(value)?value.slice(1):value;
}

function parseRows(text) {
  const rows=[];let row=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const ch=text[i];
    if(quoted) {
      if(ch==='"'&&text[i+1]==='"'){cell+='"';i++;}
      else if(ch==='"')quoted=false;
      else cell+=ch;
    } else if(ch==='"') {
      if(cell!=='')throw new Error('Неправильно оформлены кавычки в CSV.');
      quoted=true;
    } else if(ch===',') {row.push(cell);cell='';}
    else if(ch==='\n'||ch==='\r') {
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell);cell='';
      if(row.some(value=>value!==''))rows.push(row);
      row=[];
    } else cell+=ch;
  }
  if(quoted)throw new Error('В CSV не закрыты кавычки.');
  row.push(cell);if(row.some(value=>value!==''))rows.push(row);
  return rows;
}
