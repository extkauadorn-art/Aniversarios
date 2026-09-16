import { Resend } from "resend";
export interface EmailProvider{send(input:{from:string;to:string;replyTo?:string;subject:string;text:string}):Promise<{id:string}>}
export class ResendProvider implements EmailProvider{private client=new Resend(process.env.RESEND_API_KEY);async send(i:{from:string;to:string;replyTo?:string;subject:string;text:string}){const {data,error}=await this.client.emails.send(i);if(error)throw new Error(error.message);return {id:data!.id}}}
export class ConsoleProvider implements EmailProvider{async send(i:{to:string;subject:string}){console.info("[email:dry-run]",{to:i.to,subject:i.subject});return{id:`dry-${Date.now()}`}}}
export function emailProvider():EmailProvider{return process.env.EMAIL_DRY_RUN==="true"||!process.env.RESEND_API_KEY?new ConsoleProvider():new ResendProvider()}
