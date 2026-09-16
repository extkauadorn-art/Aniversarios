import * as XLSX from "xlsx"; import { validEmail } from "./birthdays";
const norm=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const aliases={nome:["nome","colaborador","funcionario"],email:["email","emailcorporativo"],dataNascimento:["aniversario","datanascimento","nascimento"],telefone:["contatocorporativo","telefone","celular"],area:["area","setor"],equipe:["equipe","time"],cargo:["cargo","funcao"]};
export type ImportedRow={nome:string;email:string|null;dataNascimento:Date|null;telefone?:string;area?:string;equipe?:string;cargo?:string;aba:string;erro?:string};
export type AnalyzedRow = ImportedRow & {
  duplicado: boolean;
  semEmail: boolean;
  semData: boolean;
};

export function analyzeRows(rows: ImportedRow[], existingEmails: Array<string | null>) {
  const seen = new Set(existingEmails.flatMap((email) => (email ? [email.toLowerCase()] : [])));
  return rows.map<AnalyzedRow>((row) => {
    const duplicado = Boolean(row.email && seen.has(row.email));
    if (row.email) seen.add(row.email);
    return {
      ...row,
      duplicado,
      semEmail: !row.email,
      semData: !row.dataNascimento
    };
  });
}

export function parseWorkbook(buffer:Buffer):ImportedRow[]{const wb=XLSX.read(buffer,{type:"buffer",cellDates:true});return wb.SheetNames.flatMap(aba=>{const rows=XLSX.utils.sheet_to_json<Record<string,unknown>>(wb.Sheets[aba],{defval:""});return rows.map(row=>{const keys=Object.keys(row);const get=(kind:keyof typeof aliases)=>{const key=keys.find(k=>aliases[kind].includes(norm(k)));return key?row[key]:""};const raw=get("dataNascimento");let date:Date|null=raw instanceof Date?raw:raw?new Date(String(raw)):null;if(date&&isNaN(date.getTime()))date=null;const email=String(get("email")||"").trim().toLowerCase()||null;const nome=String(get("nome")||"").trim();return{nome,email,dataNascimento:date,telefone:String(get("telefone")||""),area:String(get("area")||""),equipe:String(get("equipe")||aba),cargo:String(get("cargo")||""),aba,erro:!nome?"Nome ausente":email&&!validEmail(email)?"E-mail inválido":undefined}})})}
