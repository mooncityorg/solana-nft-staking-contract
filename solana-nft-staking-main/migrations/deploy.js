const idl = require("../target/idl/test_stake.json");
const anchor = require("@project-serum/anchor");
const web3 = anchor.web3;
const MAX_ITEMS = 1000;
const programID = new web3.PublicKey(idl.metadata.address);

module.exports = async function (provider) {
  anchor.setProvider(provider);

  const program = new anchor.Program(idl, programID, provider);
  const stakeStore = web3.Keypair.generate();
  const stakeList = web3.Keypair.generate();
  try {
    const tx = await program.rpc.initialize(new anchor.BN(MAX_ITEMS), {
      accounts: {
        store: stakeStore.publicKey,
        list: stakeList.publicKey,
        payer: provider.wallet.publicKey,
        systemProgram: web3.SystemProgram.programId,
      },
      instructions: [
        await program.account.stakeStore.createInstruction(
          stakeStore,
          1 + 32 + 8 + 32 + 8 + 8,
        ),
        await program.account.stakeList.createInstruction(
          stakeList,
          104 * MAX_ITEMS + 8
        ),
      ],
      signers: [stakeStore, stakeList],
    });
    console.log("store key: ", stakeStore.publicKey.toString());
    console.log("list key: ", stakeList.publicKey.toString());
  } catch (err) {
    console.log("Transaction error during migration:", err);
  }
};
