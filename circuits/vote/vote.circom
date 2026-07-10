pragma circom 2.1.6;

// ============================================================================
// vote.circom — anonymous membership vote (Phase 2A)
//
// Proves, without revealing the voter's identity:
//   1. MEMBERSHIP  — the voter's identity commitment is a leaf of the
//                    membership Merkle tree (root is a public signal).
//   2. UNIQUENESS  — nullifierHash = Poseidon(identityNullifier,
//                    externalNullifier); the ballot contract rejects reuse.
//   3. BINDING     — the vote signal and ballot (externalNullifier) are
//                    constrained inside the proof, so a proof can't be
//                    replayed for a different ballot or flipped to a
//                    different vote.
//
// identityCommitment = Poseidon(identityNullifier, identityTrapdoor)
// (Semaphore-style identity; same Poseidon toolchain as password-recovery.)
//
// Public signals (order matters — must match PrivateBallot.sol):
//   [0] root               — membership Merkle root
//   [1] nullifierHash      — Poseidon(identityNullifier, externalNullifier)
//   [2] voteSignal         — 0 against / 1 for / 2 abstain
//   [3] externalNullifier  — keccak(ballotId) % p, computed by the client
//
// Build (mirrors circuits/password-recovery/build.sh):
//   circom vote.circom --r1cs --wasm --sym -l ../node_modules
//   snarkjs groth16 setup vote.r1cs pot_final.ptau vote_0000.zkey
//   ... contribute, export PrivateVotingVerifier.sol
// ============================================================================

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";
include "circomlib/circuits/comparators.circom";

// Standard Poseidon Merkle inclusion proof over a depth-`levels` tree.
template MerkleInclusion(levels) {
    signal input leaf;
    signal input pathElements[levels];
    signal input pathIndices[levels]; // 0 = leaf on the left, 1 = on the right
    signal output root;

    signal hashes[levels + 1];
    hashes[0] <== leaf;

    component hashers[levels];
    component muxL[levels];
    component muxR[levels];

    for (var i = 0; i < levels; i++) {
        // pathIndices must be bits
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        muxL[i] = Mux1();
        muxL[i].c[0] <== hashes[i];
        muxL[i].c[1] <== pathElements[i];
        muxL[i].s <== pathIndices[i];

        muxR[i] = Mux1();
        muxR[i].c[0] <== pathElements[i];
        muxR[i].c[1] <== hashes[i];
        muxR[i].s <== pathIndices[i];

        hashers[i] = Poseidon(2);
        hashers[i].inputs[0] <== muxL[i].out;
        hashers[i].inputs[1] <== muxR[i].out;
        hashes[i + 1] <== hashers[i].out;
    }

    root <== hashes[levels];
}

template Vote(levels) {
    // Private inputs — the identity + its Merkle path
    signal input identityNullifier;
    signal input identityTrapdoor;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    // Public inputs
    signal input root;
    signal input nullifierHash;
    signal input voteSignal;
    signal input externalNullifier;

    // 1. Recompute the identity commitment
    component commitment = Poseidon(2);
    commitment.inputs[0] <== identityNullifier;
    commitment.inputs[1] <== identityTrapdoor;

    // 2. Prove Merkle membership of the commitment
    component tree = MerkleInclusion(levels);
    tree.leaf <== commitment.out;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }
    tree.root === root;

    // 3. Bind the nullifier to this ballot
    component nullifier = Poseidon(2);
    nullifier.inputs[0] <== identityNullifier;
    nullifier.inputs[1] <== externalNullifier;
    nullifier.out === nullifierHash;

    // 4. Constrain the vote signal to {0, 1, 2}
    signal isValidVote;
    component lt = LessThan(3);
    lt.in[0] <== voteSignal;
    lt.in[1] <== 3;
    isValidVote <== lt.out;
    isValidVote === 1;
}

// Depth 20 ≈ 1M members — matches Semaphore's default.
component main {public [root, nullifierHash, voteSignal, externalNullifier]} = Vote(20);
