use anchor_lang::prelude::*;
use anchor_spl::token::{self, SetAuthority, Token, TokenAccount, Transfer};
use spl_token::instruction::AuthorityType;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");
const TRANSIENT_NFT_STAKE_SEED_PREFIX: &[u8] = b"transient";
pub const METAPLEX_PROGRAM_ID: &'static str = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
pub const SYMBOL: &[u8] = b"HVORIGINS";

#[program]
pub mod test_stake {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, max_len: u64) -> ProgramResult {
        let store = &mut ctx.accounts.store;
        store.is_initialized = true;
        store.staked_count = 0;
        store.max_items = max_len;
        store.payer = *ctx.accounts.payer.key;
        store.stake_list = ctx.accounts.list.key();
        Ok(())
    }

    pub fn stake_nft(ctx: Context<StakeNFT>, symbol: String) -> ProgramResult {
        let metaplex_pubkey = METAPLEX_PROGRAM_ID
            .parse::<Pubkey>()
            .expect("Failed to parse Metaplex Program Id");

        let mint = *ctx.accounts.mint.key;

        let seeds = &[
            "metadata".as_bytes(),
            metaplex_pubkey.as_ref(),
            mint.as_ref(),
        ];

        let (metadata_pda, _) = Pubkey::find_program_address(seeds, &metaplex_pubkey);

        if metadata_pda != *ctx.accounts.metadata.key {
            return Err(ErrorCode::NoMatchMetadata.into());
        }

        if symbol.as_bytes() != SYMBOL {
            return Err(ErrorCode::NoMatchSymbol.into());
        }

        let (pda, _bump_seed) = Pubkey::find_program_address(
            &[
                &TRANSIENT_NFT_STAKE_SEED_PREFIX[..],
                ctx.accounts.depositor.key.as_ref(),
                ctx.accounts.mint.key.as_ref(),
            ],
            ctx.program_id,
        );
        token::set_authority(ctx.accounts.into(), AuthorityType::AccountOwner, Some(pda))?;
        {
            let store = &mut ctx.accounts.store;
            let list = &mut ctx.accounts.list;
            list.items.resize(store.staked_count as usize + 1, StakeItem {
                owner: *ctx.accounts.depositor.key,
                token_mint: *ctx.accounts.mint.key,
                holder: *ctx.accounts.stake_nft.key,
                stake_time: ctx.accounts.clock.unix_timestamp,
            });
        }
        {
            let store = &mut ctx.accounts.store;
            store.staked_count += 1;
        }
        Ok(())
    }

    pub fn reclaim_nft(ctx: Context<ReclaimNFT>) -> ProgramResult {
        let withdrawer = *ctx.accounts.withdrawer.key;
        let mint = *ctx.accounts.mint.key;
        let (_pda, bump_seed) = Pubkey::find_program_address(
            &[
                &TRANSIENT_NFT_STAKE_SEED_PREFIX[..],
                withdrawer.as_ref(),
                mint.as_ref(),
            ],
            ctx.program_id,
        );
        let seeds = &[
            &TRANSIENT_NFT_STAKE_SEED_PREFIX[..],
            withdrawer.as_ref(),
            mint.as_ref(),
            &[bump_seed],
        ];
        // check if possible to withdraw based on current time
        let mut founded = None;
        {
            let list = &mut ctx.accounts.list;
            founded = list.items.iter().position(|&x| x.owner == withdrawer && x.token_mint == mint);

            if founded.is_some()
                && ctx.accounts.clock.unix_timestamp
                < 30 + list.items.get(founded.unwrap()).unwrap().stake_time
            {
                return Err(ErrorCode::NotEnoughTime.into());
            }

            // transfer token to withdrawer and return stake account
            token::transfer(
                ctx.accounts
                    .into_transfer_to_taker_context()
                    .with_signer(&[&seeds[..]]),
                1,
            )?;

            token::set_authority(
                ctx.accounts
                    .into_set_authority_context()
                    .with_signer(&[&seeds[..]]),
                AuthorityType::AccountOwner,
                Some(withdrawer),
            )?;
        }

        {
            // remove item
            let list = &mut ctx.accounts.list;
            list.items.remove(founded.unwrap());
        }

        {
            let store = &mut ctx.accounts.store;
            store.staked_count -= 1;
        }
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(zero)]
    pub store: ProgramAccount<'info, StakeStore>,
    #[account(zero)]
    pub list: ProgramAccount<'info, StakeList>,
    #[account(signer)]
    pub payer: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeNFT<'info> {
    #[account(mut)]
    pub store: ProgramAccount<'info, StakeStore>,
    #[account(mut)]
    pub list: ProgramAccount<'info, StakeList>,
    #[account(mut)]
    pub depositor: AccountInfo<'info>,
    #[account(mut)]
    pub stake_nft: AccountInfo<'info>,
    pub metadata: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReclaimNFT<'info> {
    #[account(mut)]
    pub withdrawer: AccountInfo<'info>,
    #[account(mut)]
    pub store: ProgramAccount<'info, StakeStore>,
    #[account(mut)]
    pub list: ProgramAccount<'info, StakeList>,
    #[account(mut)]
    pub reclaim_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub pda_stake_token_account: Account<'info, TokenAccount>,
    pub pda_account: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    pub clock: Sysvar<'info, Clock>,
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[account]
pub struct StakeStore {
    pub is_initialized: bool,
    pub payer: Pubkey,
    pub staked_count: u64,
    pub stake_list: Pubkey,
    pub max_items: u64,
}

impl StakeStore {
    pub const LEN: usize = 1 + 32 + 8 + 32 + 8;
}

#[account]
pub struct StakeList {
    pub items: Vec<StakeItem>
}

#[derive(AnchorSerialize, AnchorDeserialize, Copy, Clone, Default)]
pub struct StakeItem {
    pub owner: Pubkey,
    pub token_mint: Pubkey,
    pub holder: Pubkey,
    pub stake_time: i64,
}

impl<'info> From<&mut StakeNFT<'info>> for CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
    fn from(accounts: &mut StakeNFT<'info>) -> Self {
        let cpi_accounts = SetAuthority {
            account_or_mint: accounts.stake_nft.clone(),
            current_authority: accounts.depositor.clone(),
        };
        let cpi_program = accounts.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

impl<'info> ReclaimNFT<'info> {
    fn into_transfer_to_taker_context(&self) -> CpiContext<'_, '_, '_, 'info, Transfer<'info>> {
        let cpi_accounts = Transfer {
            from: self.pda_stake_token_account.to_account_info().clone(),
            to: self.reclaim_token_account.to_account_info().clone(),
            authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }

    fn into_set_authority_context(&self) -> CpiContext<'_, '_, '_, 'info, SetAuthority<'info>> {
        let cpi_accounts = SetAuthority {
            account_or_mint: self.pda_stake_token_account.to_account_info().clone(),
            current_authority: self.pda_account.clone(),
        };
        let cpi_program = self.token_program.to_account_info();
        CpiContext::new(cpi_program, cpi_accounts)
    }
}

#[error]
pub enum ErrorCode {
    #[msg("not enough time to reclaim")]
    NotEnoughTime,
    #[msg("invalid metadata information")]
    NoMatchMetadata,
    #[msg("invalid token")]
    NoMatchSymbol,
}
