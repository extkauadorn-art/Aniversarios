import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { emailProvider } from "./email";
import { matchesBirthday, renderTemplate, validEmail } from "./birthdays";

export async function sendBirthday(
  employeeId: string,
  { automatic = false, now = new Date() } = {}
) {
  const [employee, settings] = await Promise.all([
    prisma.employee.findUniqueOrThrow({ where: { id: employeeId } }),
    prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } })
  ]);
  const year = now.getUTCFullYear();
  const idempotencyKey = automatic ? `${employeeId}:${year}` : null;
  if (idempotencyKey) {
    const old = await prisma.birthdaySend.findUnique({ where: { idempotencyKey } });
    if (old) return old;
  }

  const subject = renderTemplate(settings.subjectTemplate, employee);
  const message = renderTemplate(settings.bodyTemplate, employee);
  const month = employee.dataNascimento.getUTCMonth();
  const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  let record;
  try {
    record = await prisma.birthdaySend.create({
      data: {
        employeeId,
        anoReferencia: year,
        automatico: automatic,
        idempotencyKey,
        emailDestino: employee.email,
        dataAniversario: new Date(
          Date.UTC(year, month, Math.min(employee.dataNascimento.getUTCDate(), maxDay))
        ),
        assunto: subject,
        mensagem: message,
        status: "PENDENTE"
      }
    });
  } catch (error) {
    // Duas execuções do cron podem chegar juntas. O índice único é a garantia final.
    if (idempotencyKey && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.birthdaySend.findUniqueOrThrow({ where: { idempotencyKey } });
    }
    throw error;
  }

  if (!employee.ativo || !validEmail(employee.email)) {
    return prisma.birthdaySend.update({
      where: { id: record.id },
      data: {
        status: employee.ativo ? "ERRO" : "IGNORADO",
        errorMessage: employee.ativo ? "E-mail ausente ou inválido" : "Colaborador inativo"
      }
    });
  }

  try {
    await emailProvider().send({
      from: settings.senderEmail,
      to: employee.email,
      replyTo: settings.replyTo || undefined,
      subject,
      text: message
    });
    return prisma.birthdaySend.update({
      where: { id: record.id },
      data: { status: "ENVIADO", sentAt: new Date() }
    });
  } catch (error) {
    return prisma.birthdaySend.update({
      where: { id: record.id },
      data: {
        status: "ERRO",
        errorMessage: error instanceof Error ? error.message.slice(0, 500) : "Falha desconhecida"
      }
    });
  }
}

export async function runDaily(now = new Date()) {
  const settings = await prisma.settings.findUniqueOrThrow({ where: { id: "singleton" } });
  if (!settings.automaticEnabled) return [];
  const employees = await prisma.employee.findMany({ where: { ativo: true } });
  const due = employees.filter((employee) =>
    matchesBirthday(employee.dataNascimento, now, settings.leapDayPolicy)
  );
  return Promise.all(due.map((employee) => sendBirthday(employee.id, { automatic: true, now })));
}
