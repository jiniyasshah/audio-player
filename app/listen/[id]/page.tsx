import Listener from '../../listener';
export default async function Listen({params}:{params:Promise<{id:string}>}){return <Listener id={(await params).id}/>;}
