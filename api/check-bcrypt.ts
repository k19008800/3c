import bcrypt from 'bcryptjs';

const hash = '$2a$12$kB6dEDuF7TOhOQtg5y3bQuHv22se337J.pgr2cdAKvuAv24xUCeuS';
const password = '***';

console.log('verify:', bcrypt.compareSync(password, hash));
console.log('new hash:', bcrypt.hashSync(password, 12));
