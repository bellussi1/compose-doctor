export class DoctorError extends Error {readonly code:string;readonly exitCode=2;constructor(code:string){super(code);this.code=code;}}
