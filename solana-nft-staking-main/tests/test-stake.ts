import * as assert from "assert";
import * as anchor from "@project-serum/anchor";
import {
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { TestStake } from "../target/types/test_stake";
import { TOKEN_PROGRAM_ID, Token } from "@solana/spl-token";

const MAX_ITEMS = 1000;
const TRANSIENT_NFT_STAKE_SEED_PREFIX = "transient";
const web3 = anchor.web3;

describe("test-stake", () => {
  // Configure the client to use the local cluster.
  const provider = anchor.Provider.local();
  anchor.setProvider(provider);

  const program = anchor.workspace.TestStake as anchor.Program<TestStake>;
  const stakeStore = web3.Keypair.generate();
  const stakeList = web3.Keypair.generate();
  let mintNFT1: Token = null;
  let mintNFT2: Token = null;
  let userAccountNFT1: web3.PublicKey = null;
  let userAccountNFT2: web3.PublicKey = null;

  it("initialize", async () => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        provider.wallet.publicKey,
        LAMPORTS_PER_SOL * 3
      ),
      "confirmed"
    );

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

    let stakeStoreAccount = await program.account.stakeStore.fetch(
      stakeStore.publicKey
    );
    let stakeListAccount = await program.account.stakeList.fetch(
      stakeList.publicKey
    );

    console.log(stakeStoreAccount);

    assert.ok(stakeStoreAccount.isInitialized === true);
    assert.ok(stakeStoreAccount.stakedCount.toNumber() === 0);
    assert.ok(stakeListAccount.items.length === 0);

    mintNFT1 = await Token.createMint(
      provider.connection,
      provider.wallet.payer, // node only
      provider.wallet.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );

    mintNFT2 = await Token.createMint(
      provider.connection,
      provider.wallet.payer, // node only
      provider.wallet.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID
    );
  });

  it("stake nft", async () => {
    userAccountNFT1 = await mintNFT1.createAccount(provider.wallet.publicKey);
    userAccountNFT2 = await mintNFT2.createAccount(provider.wallet.publicKey);
    let stakeAccountNFT1 = await mintNFT1.createAccount(
      provider.wallet.publicKey
    );
    let stakeAccountNFT2 = await mintNFT2.createAccount(
      provider.wallet.publicKey
    );

    await mintNFT1.mintTo(userAccountNFT1, provider.wallet.publicKey, [], 1);

    await mintNFT2.mintTo(userAccountNFT2, provider.wallet.publicKey, [], 1);

    let _userAccountNFT1 = await mintNFT1.getAccountInfo(userAccountNFT1);
    let _userAccountNFT2 = await mintNFT2.getAccountInfo(userAccountNFT2);
    let _stakeAccountNFT1 = await mintNFT1.getAccountInfo(stakeAccountNFT1);
    let _stakeAccountNFT2 = await mintNFT2.getAccountInfo(stakeAccountNFT2);

    assert.ok(_userAccountNFT1.amount.toNumber() === 1);
    assert.ok(_userAccountNFT2.amount.toNumber() === 1);
    assert.ok(_stakeAccountNFT1.amount.toNumber() === 0);
    assert.ok(_stakeAccountNFT2.amount.toNumber() === 0);

    await mintNFT1.transfer(
      userAccountNFT1,
      stakeAccountNFT1,
      provider.wallet.publicKey,
      [],
      1
    );
    await mintNFT2.transfer(
      userAccountNFT2,
      stakeAccountNFT2,
      provider.wallet.publicKey,
      [],
      1
    );

    _userAccountNFT1 = await mintNFT1.getAccountInfo(userAccountNFT1);
    _userAccountNFT2 = await mintNFT2.getAccountInfo(userAccountNFT2);
    _stakeAccountNFT1 = await mintNFT1.getAccountInfo(stakeAccountNFT1);
    _stakeAccountNFT2 = await mintNFT2.getAccountInfo(stakeAccountNFT2);

    assert.ok(_userAccountNFT1.amount.toNumber() === 0);
    assert.ok(_userAccountNFT2.amount.toNumber() === 0);
    assert.ok(_stakeAccountNFT1.amount.toNumber() === 1);
    assert.ok(_stakeAccountNFT2.amount.toNumber() === 1);

    await program.rpc.stakeNft({
      accounts: {
        store: stakeStore.publicKey,
        list: stakeList.publicKey,
        depositor: provider.wallet.publicKey,
        stakeNft: stakeAccountNFT1,
        mint: mintNFT1.publicKey,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [],
    });

    let stakeStoreAccount = await program.account.stakeStore.fetch(
      stakeStore.publicKey
    );
    let stakeListAccount = await program.account.stakeList.fetch(
      stakeList.publicKey
    );
    assert.ok(stakeStoreAccount.stakedCount.toNumber() === 1);
    assert.ok(
      stakeListAccount.items[0].holder.toString() ===
        stakeAccountNFT1.toString()
    );

    await program.rpc.stakeNft({
      accounts: {
        store: stakeStore.publicKey,
        list: stakeList.publicKey,
        depositor: provider.wallet.publicKey,
        stakeNft: stakeAccountNFT2,
        mint: mintNFT2.publicKey,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [],
    });
    stakeStoreAccount = await program.account.stakeStore.fetch(
      stakeStore.publicKey
    );
    stakeListAccount = await program.account.stakeList.fetch(
      stakeList.publicKey
    );
    assert.ok(stakeStoreAccount.stakedCount.toNumber() === 2);
    assert.ok(
      stakeListAccount.items[1].holder.toString() ===
        stakeAccountNFT2.toString()
    );
  });

  it("reclaim nft", async () => {
    let stakeAccountNFT1: web3.PublicKey = null;
    let stakeAccountNFT2: web3.PublicKey = null;
    let stakeStoreAccount = await program.account.stakeStore.fetch(
      stakeStore.publicKey
    );
    let stakeListAccount = await program.account.stakeList.fetch(
      stakeList.publicKey
    );
    for (let i = 0; i < stakeStoreAccount.stakedCount.toNumber(); i++) {
      if (
        stakeListAccount.items[i].owner.toString() ===
          provider.wallet.publicKey.toString() &&
        stakeListAccount.items[i].tokenMint.toString() ===
          mintNFT1.publicKey.toString()
      ) {
        stakeAccountNFT1 = stakeListAccount.items[i].holder;
      }
      if (
        stakeListAccount.items[i].owner.toString() ===
          provider.wallet.publicKey.toString() &&
        stakeListAccount.items[i].tokenMint.toString() ===
          mintNFT2.publicKey.toString()
      ) {
        stakeAccountNFT2 = stakeListAccount.items[i].holder;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 10000));

    let [pda, _nonce] = await PublicKey.findProgramAddress(
      [
        Buffer.from(
          anchor.utils.bytes.utf8.encode(TRANSIENT_NFT_STAKE_SEED_PREFIX)
        ),
        provider.wallet.publicKey.toBytes(),
        mintNFT1.publicKey.toBytes(),
      ],
      program.programId
    );

    await program.rpc.reclaimNft({
      accounts: {
        withdrawer: provider.wallet.publicKey,
        store: stakeStore.publicKey,
        list: stakeList.publicKey,
        pdaStakeTokenAccount: stakeAccountNFT1,
        reclaimTokenAccount: userAccountNFT1,
        pdaAccount: pda,
        mint: mintNFT1.publicKey,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [],
    });
    stakeStoreAccount = await program.account.stakeStore.fetch(
      stakeStore.publicKey
    );
    stakeListAccount = await program.account.stakeList.fetch(
      stakeList.publicKey
    );

    let _userAccountNFT1 = await mintNFT1.getAccountInfo(userAccountNFT1);
    let _stakeAccountNFT1 = await mintNFT1.getAccountInfo(stakeAccountNFT1);
    assert.ok(_userAccountNFT1.amount.toNumber() === 1);
    assert.ok(_stakeAccountNFT1.amount.toNumber() === 0);

    [pda, _nonce] = await PublicKey.findProgramAddress(
      [
        Buffer.from(
          anchor.utils.bytes.utf8.encode(TRANSIENT_NFT_STAKE_SEED_PREFIX)
        ),
        provider.wallet.publicKey.toBytes(),
        mintNFT2.publicKey.toBytes(),
      ],
      program.programId
    );

    await program.rpc.reclaimNft({
      accounts: {
        withdrawer: provider.wallet.publicKey,
        store: stakeStore.publicKey,
        list: stakeList.publicKey,
        pdaStakeTokenAccount: stakeAccountNFT2,
        reclaimTokenAccount: userAccountNFT2,
        pdaAccount: pda,
        mint: mintNFT2.publicKey,
        clock: web3.SYSVAR_CLOCK_PUBKEY,
        systemProgram: web3.SystemProgram.programId,
        tokenProgram: TOKEN_PROGRAM_ID,
      },
      signers: [],
    });

    let _userAccountNFT2 = await mintNFT2.getAccountInfo(userAccountNFT2);
    let _stakeAccountNFT2 = await mintNFT2.getAccountInfo(stakeAccountNFT2);
    assert.ok(_userAccountNFT2.amount.toNumber() === 1);
    assert.ok(_stakeAccountNFT2.amount.toNumber() === 0);
  });
});
