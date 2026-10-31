async function activarCuenta() {
  throw new Error('La activación manual fue retirada. Iniciá sesión y completá un perfil nuevo desde Mi perfil.');
}
if (require.main === module) activarCuenta().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { activarCuenta };
