import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "./prisma";
import { matchesBirthday } from "./birthdays";
import { sendBirthday } from "./send";

const testMarker = `ci-${randomUUID()}`;
const employeeIds: string[] = [];

describe.sequential("fluxo integrado com PostgreSQL", () => {
  beforeAll(async () => {
    process.env.EMAIL_DRY_RUN = "true";
    delete process.env.RESEND_API_KEY;
    await prisma.settings.upsert({
      where: { id: "singleton" },
      update: { automaticEnabled: true },
      create: {
        automaticEnabled: true,
        bodyTemplate: "Olá, {{nome}}! Equipe: {{equipe}}"
      }
    });
  });

  afterAll(async () => {
    await prisma.employee.deleteMany({ where: { id: { in: employeeIds } } });
    await prisma.$disconnect();
  });

  it("cadastra, edita, lista e identifica o aniversariante", async () => {
    const today = new Date();
    const employee = await prisma.employee.create({
      data: {
        nome: `Colaborador ${testMarker}`,
        email: `${testMarker}@example.test`,
        dataNascimento: new Date(Date.UTC(1990, today.getUTCMonth(), today.getUTCDate())),
        area: "Operações",
        equipe: "Line Haul"
      }
    });
    employeeIds.push(employee.id);

    const edited = await prisma.employee.update({
      where: { id: employee.id },
      data: { cargo: "Analista" }
    });
    const listed = await prisma.employee.findUniqueOrThrow({ where: { id: employee.id } });

    expect(edited.cargo).toBe("Analista");
    expect(listed.email).toBe(`${testMarker}@example.test`);
    expect(matchesBirthday(listed.dataNascimento, today)).toBe(true);
    expect(listed.dataNascimento.getUTCMonth()).toBe(today.getUTCMonth());
  });

  it("registra histórico e impede envio automático duplicado", async () => {
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { email: `${testMarker}@example.test` }
    });
    const now = new Date();
    const first = await sendBirthday(employee.id, { automatic: true, now });
    const second = await sendBirthday(employee.id, { automatic: true, now });
    const history = await prisma.birthdaySend.findMany({
      where: { employeeId: employee.id, automatico: true }
    });

    expect(first.status).toBe("ENVIADO");
    expect(second.id).toBe(first.id);
    expect(history).toHaveLength(1);
  });

  it("permite reenvio manual e ignora colaborador inativo", async () => {
    const employee = await prisma.employee.findUniqueOrThrow({
      where: { email: `${testMarker}@example.test` }
    });
    const manualOne = await sendBirthday(employee.id);
    const manualTwo = await sendBirthday(employee.id);
    expect(manualTwo.id).not.toBe(manualOne.id);

    const inactive = await prisma.employee.create({
      data: {
        nome: `Inativo ${testMarker}`,
        email: `inativo-${testMarker}@example.test`,
        dataNascimento: new Date("1990-01-01T00:00:00.000Z"),
        ativo: false
      }
    });
    employeeIds.push(inactive.id);
    const ignored = await sendBirthday(inactive.id, { automatic: true });
    expect(ignored.status).toBe("IGNORADO");
  });
});
