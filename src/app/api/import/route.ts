import { analyzeRows, parseWorkbook } from "@/lib/importer";
import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ erro: "Arquivo obrigatório" }, { status: 400 });
  }
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return NextResponse.json({ erro: "Formato não suportado" }, { status: 415 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ erro: "O arquivo deve ter no máximo 10 MB" }, { status: 413 });
  }

  let rows;
  try {
    rows = parseWorkbook(Buffer.from(await file.arrayBuffer()));
  } catch {
    return NextResponse.json({ erro: "Não foi possível ler a planilha" }, { status: 422 });
  }
  const existing = await prisma.employee.findMany({ select: { email: true } });
  const analyzed = analyzeRows(rows, existing.map((employee) => employee.email));
  const valid = analyzed.filter(
    (row) => !row.erro && !row.duplicado && row.dataNascimento && row.nome
  );

  if (form.get("confirm") === "true") {
    let imported = 0;
    for (const row of valid) {
      await prisma.employee.create({
        data: {
          nome: row.nome,
          email: row.email,
          dataNascimento: row.dataNascimento!,
          telefone: row.telefone,
          area: row.area,
          equipe: row.equipe,
          cargo: row.cargo
        }
      });
      imported += 1;
    }
    await prisma.auditLog.create({
      data: { action: "IMPORT", entity: "Employee", details: { file: file.name, imported } }
    });
    return NextResponse.json({ imported });
  }

  return NextResponse.json({
    total: rows.length,
    validos: valid.length,
    duplicados: analyzed.filter((row) => row.duplicado).length,
    semEmail: analyzed.filter((row) => row.semEmail).length,
    semData: analyzed.filter((row) => row.semData).length,
    erros: analyzed.filter((row) => row.erro).length,
    rows: analyzed.slice(0, 100)
  });
}
