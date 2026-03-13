// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/MoralityComments.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MoralityCommentsTest is Test {
    MoralityComments internal comments;

    address internal owner = address(this);
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal charlie = makeAddr("charlie");
    address internal tipping = makeAddr("tipping");

    bytes32 internal constant ENTITY_A = keccak256("entity:a");
    bytes32 internal constant ENTITY_B = keccak256("entity:b");

    function setUp() public {
        MoralityComments impl = new MoralityComments();
        ERC1967Proxy proxy = new ERC1967Proxy(
            address(impl),
            abi.encodeCall(MoralityComments.initialize, ())
        );
        comments = MoralityComments(address(proxy));
    }

    function test_commentCreatesAndEmits() public {
        vm.prank(alice);
        vm.expectEmit(true, true, true, true, address(comments));
        emit MoralityComments.CommentCreated(1, ENTITY_A, alice, 0);
        uint256 commentId = comments.comment(ENTITY_A, "hello world", 0);

        assertEq(commentId, 1);
        MoralityComments.Comment memory c = comments.getComment(commentId);
        assertEq(c.id, 1);
        assertEq(c.entityHash, ENTITY_A);
        assertEq(c.author, alice);
        assertEq(c.content, "hello world");
        assertEq(c.parentId, 0);
        assertEq(c.score, 0);
        assertEq(c.tipTotal, 0);
        assertTrue(c.exists);
    }

    function test_commentValidation() public {
        vm.prank(alice);
        vm.expectRevert("Empty comment");
        comments.comment(ENTITY_A, "", 0);

        string memory tooLong = new string(2001);
        vm.prank(alice);
        vm.expectRevert("Comment too long");
        comments.comment(ENTITY_A, tooLong, 0);
    }

    function test_replyValidationAndChildTracking() public {
        vm.prank(alice);
        uint256 parentId = comments.comment(ENTITY_A, "parent", 0);

        vm.prank(bob);
        uint256 childId = comments.comment(ENTITY_A, "child", parentId);
        assertEq(childId, 2);

        uint256[] memory children = comments.getChildComments(parentId);
        assertEq(children.length, 1);
        assertEq(children[0], childId);

        vm.prank(bob);
        vm.expectRevert("Parent does not exist");
        comments.comment(ENTITY_A, "bad", 999);

        vm.prank(bob);
        vm.expectRevert("Parent entity mismatch");
        comments.comment(ENTITY_B, "wrong entity", parentId);
    }

    function test_commentStructuredStoresArgumentMetadata() public {
        vm.prank(alice);
        uint256 baseId = comments.comment(ENTITY_A, "base claim", 0);

        bytes32 evidenceHash = keccak256("evidence");
        vm.prank(bob);
        vm.expectEmit(true, true, true, true, address(comments));
        emit MoralityComments.StructuredCommentCreated(
            2,
            ENTITY_A,
            bob,
            baseId,
            MoralityComments.ArgumentType.COUNTERCLAIM,
            baseId,
            evidenceHash
        );
        uint256 structuredId = comments.commentStructured(
            ENTITY_A,
            "counter evidence",
            baseId,
            MoralityComments.ArgumentType.COUNTERCLAIM,
            baseId,
            evidenceHash
        );

        (
            MoralityComments.ArgumentType argumentType,
            uint256 referenceCommentId,
            bytes32 storedEvidenceHash,
            bool exists
        ) = comments.getArgumentMeta(structuredId);
        assertEq(uint8(argumentType), uint8(MoralityComments.ArgumentType.COUNTERCLAIM));
        assertEq(referenceCommentId, baseId);
        assertEq(storedEvidenceHash, evidenceHash);
        assertTrue(exists);
    }

    function test_commentStructuredWithoutReferencePath() public {
        vm.prank(alice);
        uint256 structuredId =
            comments.commentStructured(ENTITY_A, "source link", 0, MoralityComments.ArgumentType.SOURCE, 0, bytes32(0));

        (MoralityComments.ArgumentType argumentType, uint256 referenceCommentId,, bool exists) =
            comments.getArgumentMeta(structuredId);
        assertEq(uint8(argumentType), uint8(MoralityComments.ArgumentType.SOURCE));
        assertEq(referenceCommentId, 0);
        assertTrue(exists);
    }

    function test_commentStructuredReferenceValidation() public {
        vm.prank(alice);
        uint256 refId = comments.comment(ENTITY_A, "reference", 0);

        vm.prank(bob);
        vm.expectRevert("Reference does not exist");
        comments.commentStructured(
            ENTITY_A, "bad ref", 0, MoralityComments.ArgumentType.EVIDENCE, refId + 999, bytes32(uint256(1))
        );

        vm.prank(bob);
        vm.expectRevert("Reference entity mismatch");
        comments.commentStructured(
            ENTITY_B, "wrong entity ref", 0, MoralityComments.ArgumentType.EVIDENCE, refId, bytes32(uint256(2))
        );
    }

    function test_voteUpdatesScoreAndPreventsInvalidVotes() public {
        vm.prank(alice);
        uint256 commentId = comments.comment(ENTITY_A, "vote me", 0);

        vm.prank(alice);
        vm.expectRevert("Cannot vote own comment");
        comments.vote(commentId, 1);

        vm.prank(bob);
        vm.expectRevert("Vote must be +1 or -1");
        comments.vote(commentId, 0);

        vm.prank(bob);
        comments.vote(commentId, 1);
        assertEq(comments.getComment(commentId).score, 1);

        vm.prank(charlie);
        comments.vote(commentId, -1);
        assertEq(comments.getComment(commentId).score, 0);

        vm.prank(bob);
        comments.vote(commentId, -1);
        assertEq(comments.getComment(commentId).score, -2);

        vm.prank(bob);
        vm.expectRevert("Comment does not exist");
        comments.vote(commentId + 999, 1);
    }

    function test_entityCommentsPagination() public {
        vm.startPrank(alice);
        comments.comment(ENTITY_A, "c1", 0);
        comments.comment(ENTITY_A, "c2", 0);
        comments.comment(ENTITY_A, "c3", 0);
        vm.stopPrank();

        uint256[] memory firstPage = comments.getEntityComments(ENTITY_A, 0, 2);
        assertEq(firstPage.length, 2);
        assertEq(firstPage[0], 1);
        assertEq(firstPage[1], 2);

        uint256[] memory secondPage = comments.getEntityComments(ENTITY_A, 2, 3);
        assertEq(secondPage.length, 1);
        assertEq(secondPage[0], 3);

        uint256[] memory emptyPage = comments.getEntityComments(ENTITY_A, 5, 2);
        assertEq(emptyPage.length, 0);
        assertEq(comments.getEntityCommentCount(ENTITY_A), 3);
    }

    function test_setTippingContractAndAddTipAccessControl() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        comments.setTippingContract(tipping);

        vm.expectRevert("Zero address");
        comments.setTippingContract(address(0));

        vm.expectEmit(true, true, false, false, address(comments));
        emit MoralityComments.TippingContractUpdated(address(0), tipping);
        comments.setTippingContract(tipping);

        vm.prank(alice);
        uint256 commentId = comments.comment(ENTITY_A, "tip target", 0);

        vm.prank(charlie);
        vm.expectRevert("Not tipping contract");
        comments.addTipToComment(commentId, 1 ether);

        vm.prank(tipping);
        comments.addTipToComment(commentId, 0.25 ether);
        assertEq(comments.getComment(commentId).tipTotal, 0.25 ether);

        vm.prank(tipping);
        vm.expectRevert("Comment does not exist");
        comments.addTipToComment(commentId + 10, 1 wei);
    }

    function test_transferOwnershipOnlyOwner() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, alice));
        comments.transferOwnership(alice);

        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableInvalidOwner.selector, address(0)));
        comments.transferOwnership(address(0));

        comments.transferOwnership(alice);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(OwnableUpgradeable.OwnableUnauthorizedAccount.selector, owner));
        comments.setTippingContract(tipping);

        vm.prank(alice);
        comments.setTippingContract(tipping);
    }

    function test_getCommentRevertsWhenMissing() public {
        vm.expectRevert("Comment does not exist");
        comments.getComment(777);
    }

    function test_cannotReinitialize() public {
        vm.expectRevert();
        comments.initialize();
    }
}
