// An unguessable browser capability lets people manage uploads without an account.
const COOKIE='__Host-afterhours';
export async function browserOwner(request:Request,create=false) {
 const cookie=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
 let token=cookie&&/^[a-f0-9]{64}$/.test(cookie)?cookie:null;
 let setCookie:string|undefined;
 if(!token&&create){token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');setCookie=`${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=2592000`;}
 if(!token)return null;
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 const id='browser:'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
 return {id,setCookie};
}
export function withBrowserCookie(response:Response,owner:{setCookie?:string}){if(owner.setCookie)response.headers.set('Set-Cookie',owner.setCookie);return response;}
