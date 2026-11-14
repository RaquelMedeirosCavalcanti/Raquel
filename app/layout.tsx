import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
 title: "Meu ritmo · Kel", description: "Seu diário de corrida e musculação. Cada treino conta, no seu ritmo.",
 applicationName: "Meu ritmo",
 icons: {icon:[{url:"/icons/favicon-48-v3.png",sizes:"48x48",type:"image/png"},{url:"/icons/kel-192-v3.png",sizes:"192x192",type:"image/png"}],shortcut:"/icons/kel-192-v3.png",apple:[{url:"/icons/apple-touch-icon-v3.png",sizes:"180x180",type:"image/png"}]},
 appleWebApp: {capable:true,title:"Meu ritmo",statusBarStyle:"black-translucent"}
};
export const viewport: Viewport = {themeColor:"#101114",colorScheme:"dark"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="pt-BR"><head><link rel="manifest" href="/manifest-kel-v3.webmanifest" crossOrigin="use-credentials"/></head><body>{children}</body></html>}
