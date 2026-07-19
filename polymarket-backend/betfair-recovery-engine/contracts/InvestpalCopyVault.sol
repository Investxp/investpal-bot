// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @dev Minimal ERC-20 interface.
 */
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/**
 * @title  InvestpalCopyVault v2
 * @notice Non-custodial delegated sports-betting copy vault on SX Bet.
 *
 *  Architecture
 *  ─────────────
 *  • Follower deploys their own personal vault (one per wallet).
 *  • Follower deposits USDC.  The vault pre-approves the SX Bet token-transfer
 *    proxy so the operator can execute fills on-chain on the follower's behalf.
 *  • Operator (Investpal master wallet) can call executeCall() to interact with
 *    ANY contract EXCEPT direct USDC transfers (guardrail).
 *  • When a bet settles as a WIN, operator calls distributeProfitShare().
 *    This sends a 5 % fee to the operator; remainder stays in the vault.
 *  • Follower can withdraw at any time; operator cannot.
 *
 *  Events
 *  ──────
 *  Deposited(address user, uint256 amount)
 *  Withdrew(address user, uint256 amount)
 *  CallExecuted(address target, bytes4 selector, bytes result)
 *  ProfitDistributed(uint256 grossProfit, uint256 fee, uint256 netToFollower)
 *  OperatorChanged(address oldOperator, address newOperator)
 */
contract InvestpalCopyVault {

    // ─── State ───────────────────────────────────────────────────────────────
    address public immutable follower;
    address public operator;                   // Investpal master wallet
    IERC20  public immutable usdc;
    address public immutable tokenTransferProxy; // SX Bet proxy (pre-approved)

    uint256 public constant FEE_BPS = 500;     // 5 % (500 / 10 000)

    // ─── Events ──────────────────────────────────────────────────────────────
    event Deposited(address indexed user, uint256 amount);
    event Withdrew(address indexed user, uint256 amount);
    event CallExecuted(address indexed target, bytes4 selector, bytes result);
    event ProfitDistributed(uint256 grossProfit, uint256 fee, uint256 netToFollower);
    event OperatorChanged(address indexed oldOperator, address indexed newOperator);

    // ─── Modifiers ───────────────────────────────────────────────────────────
    modifier onlyFollower() {
        require(msg.sender == follower, "CopyVault: caller is not follower");
        _;
    }

    modifier onlyOperator() {
        require(
            msg.sender == operator || msg.sender == follower,
            "CopyVault: caller is not authorised"
        );
        _;
    }

    // ─── Constructor ─────────────────────────────────────────────────────────
    constructor(
        address _follower,
        address _operator,
        address _usdc,
        address _tokenTransferProxy
    ) {
        require(_follower != address(0),  "CopyVault: invalid follower");
        require(_operator != address(0),  "CopyVault: invalid operator");
        require(_usdc     != address(0),  "CopyVault: invalid USDC");

        follower          = _follower;
        operator          = _operator;
        usdc              = IERC20(_usdc);
        tokenTransferProxy = _tokenTransferProxy;

        // Pre-approve SX Bet proxy to spend vault USDC (max allowance)
        if (_tokenTransferProxy != address(0)) {
            require(
                usdc.approve(_tokenTransferProxy, type(uint256).max),
                "CopyVault: proxy approval failed"
            );
        }
    }

    // ─── Follower actions ────────────────────────────────────────────────────

    /**
     * @notice Deposit USDC into the vault.
     * @param amount  Amount in USDC (6 decimals on SX chain).
     */
    function deposit(uint256 amount) external {
        require(amount > 0, "CopyVault: zero deposit");
        require(
            usdc.transferFrom(msg.sender, address(this), amount),
            "CopyVault: deposit failed"
        );
        emit Deposited(msg.sender, amount);
    }

    /**
     * @notice Withdraw USDC from the vault.  Only the follower may call this.
     * @param amount  Amount to withdraw; must not exceed current balance.
     */
    function withdraw(uint256 amount) external onlyFollower {
        require(amount > 0, "CopyVault: zero withdrawal");
        require(
            usdc.transfer(follower, amount),
            "CopyVault: withdrawal failed"
        );
        emit Withdrew(follower, amount);
    }

    /**
     * @notice Change the operator address.  Only the follower may call this.
     * @param _newOperator  New operator wallet address.
     */
    function setOperator(address _newOperator) external onlyFollower {
        require(_newOperator != address(0), "CopyVault: invalid operator");
        emit OperatorChanged(operator, _newOperator);
        operator = _newOperator;
    }

    // ─── Operator actions ────────────────────────────────────────────────────

    /**
     * @notice Execute an arbitrary call against any target contract EXCEPT the
     *         USDC token itself (prevents direct theft of vault funds).
     * @param target  Contract address to call.
     * @param data    ABI-encoded calldata.
     * @return result  Raw return bytes from the call.
     */
    function executeCall(
        address target,
        bytes calldata data
    ) external onlyOperator returns (bytes memory result) {
        require(target != address(usdc), "CopyVault: direct USDC transfer forbidden");

        bool success;
        (success, result) = target.call(data);
        require(success, "CopyVault: external call failed");

        emit CallExecuted(target, bytes4(data[:4]), result);
    }

    /**
     * @notice Distribute a 5 % profit-share fee to the operator after a
     *         winning settlement.  The remaining 95 % stays inside the vault.
     *
     * @param grossProfit  Total net profit of the settled bet (6-decimal USDC).
     *                     The vault must hold at least this amount above the
     *                     original principal for the call to succeed.
     *
     * Emits {ProfitDistributed}.
     */
    function distributeProfitShare(uint256 grossProfit) external onlyOperator {
        require(grossProfit > 0, "CopyVault: no profit to share");

        uint256 fee = (grossProfit * FEE_BPS) / 10_000;
        require(fee > 0, "CopyVault: fee rounds to zero");

        uint256 vaultBalance = usdc.balanceOf(address(this));
        require(vaultBalance >= fee, "CopyVault: insufficient balance for fee");

        require(
            usdc.transfer(operator, fee),
            "CopyVault: fee transfer failed"
        );

        uint256 netToFollower = grossProfit - fee;
        emit ProfitDistributed(grossProfit, fee, netToFollower);
    }

    // ─── View helpers ────────────────────────────────────────────────────────

    /**
     * @notice Returns the vault's current USDC balance.
     */
    function vaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }
}
