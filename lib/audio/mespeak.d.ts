// SPDX-License-Identifier: GPL-3.0-or-later
declare module 'mespeak' {
 const meSpeak:{loadConfig:(config:unknown)=>void;loadVoice:(voice:unknown)=>void;speak:(text:string,options:{rawdata:'array';speed:number;pitch:number;amplitude:number})=>number[]|null};
 export default meSpeak;
}
