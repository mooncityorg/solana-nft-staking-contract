<div align="right">
  <h1>@trust0205: This is my telegram</h1>
  </div>
<div align="center">
  <h1>Test Staking Contract with Anchor</h1>
</div>

## Installation

In my case, I use WSL cause bpf-sdk of solana chain not support Windows now. 

- Anchor environment should be get ready before running this project.  
    https://project-serum.github.io/anchor/getting-started/installation.html#install-rust
`I want to recommend for you to use latest solana cli version`
- yarn install
- please set solana provider with devnet(or mainnet)

  `solana config set --url https://api.devnet.solana.com`
- anchor build
- anchor deploy
    
    `anchor deploy --provder.cluster devnet`.
    
    If you want to deploy on mainnet, you can use `anchor deploy --provider.cluster mainnet`
    
    After deployed, you need to copy test_stake.json in target/idl directory to UI project(stake_poc_ui) with named idl.json
- anchor migrate

  You can capture store key and list key in console and reflect them into `stakeStoreAddress`, `stakeListAddress` of utilData.js in UI project
- anchor test
    
    Please not to test now cause after adding symbol restriction chore, it didn't be applied on test code.
- symbol restriction
    If you want to change the collection name to restrict, please change the value of `SYMBOL` in lib.rs
- change reclaim time
  please change the value of 300 with thing you want
```
  if founded.is_some()
     && ctx.accounts.clock.unix_timestamp
  < 300 + list.items.get(founded.unwrap()).unwrap().stake_time {  
  ... 
  }
  ```
