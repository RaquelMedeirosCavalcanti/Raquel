import {copyFile,access} from 'node:fs/promises';
const target=new URL('../lib/training-plan.json',import.meta.url);
try{await access(target)}catch{await copyFile(new URL('../lib/training-plan.example.json',import.meta.url),target);console.log('Planejamento de exemplo preparado.');}
