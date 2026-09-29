import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Afterhours — A little time. Just to listen.',description:'Share a song with a private listening link that expires in 24 hours.',robots:{index:false,follow:false},referrer:'no-referrer',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>;}
