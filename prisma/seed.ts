import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
const prisma=new PrismaClient();
const body=`Olá, {{nome}}!\n\nHoje é um dia especial, e queremos desejar a você um feliz aniversário! 🎉🎂\n\nQue seu novo ciclo seja repleto de saúde, felicidade, conquistas e muitos momentos especiais.\n\nA equipe Line Haul deseja a você um excelente aniversário e muito sucesso!\n\nParabéns! 🥳\n\nUm abraço,\nEquipe Line Haul`;
async function main(){const email=process.env.ADMIN_EMAIL||"admin@linehaul.local"; const password=process.env.ADMIN_PASSWORD||"Admin123!"; await prisma.user.upsert({where:{email},update:{},create:{email,name:"Administrador",passwordHash:await bcrypt.hash(password,12)}}); await prisma.settings.upsert({where:{id:"singleton"},update:{},create:{bodyTemplate:body}}); const now=new Date(); await prisma.employee.upsert({where:{email:"ana@linehaul.local"},update:{},create:{nome:"Ana Oliveira",email:"ana@linehaul.local",dataNascimento:new Date(Date.UTC(1992,now.getUTCMonth(),now.getUTCDate())),area:"Operações",equipe:"Line Haul",cargo:"Analista"}});}
main().finally(()=>prisma.$disconnect());
