import "./globals.css";import {Sidebar} from "@/components/sidebar";import {auth} from "@/auth";
export const metadata={title:"Birthday Hub | Line Haul",description:"Gestão automatizada de aniversários"};
export const dynamic="force-dynamic";
export default async function Layout({children}:{children:React.ReactNode}){const session=await auth();return <html lang="pt-BR"><body>{session&&<Sidebar/>}<main className={session?"md:ml-64 p-5 md:p-8":""}>{children}</main></body></html>}
