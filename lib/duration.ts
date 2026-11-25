// Show the same recorded seconds as hours and minutes, rounded to the nearest minute.
export function hoursText(seconds:number){
 const minutes=Math.round(seconds/60);
 return `${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}min`;
}
