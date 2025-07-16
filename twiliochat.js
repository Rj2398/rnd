import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Card,
  Button,
  Image,
  Dropdown,
  FormControl,
  InputGroup,
  Container,
  Modal,
  Form,
} from "react-bootstrap";
import { PiClockCountdownFill, PiDotsThreeCircleLight } from "react-icons/pi";

import { Client as TwilioClient, Conversation } from "@twilio/conversations";

import { LuSend } from "react-icons/lu";
import { ImAttachment } from "react-icons/im";
import supportImg from "../../assets/gallery/Caminho 43217.png";

import { Link, useLocation, useNavigate } from "react-router-dom";

// import { Client as TwilioClient } from "@twilio/conversations";

import Row from "react-bootstrap/Row";
import Col from "react-bootstrap/Col";
import { FaSearch, FaCaretDown, FaStar } from "react-icons/fa";
// import Header from "../../components/host/Header";

import useBook from "../../hooks/host/useBook";
import { KEYS, imageBase } from "../../config/Constant";
import Loader from "../../components/Loader";
import useChat from "../../hooks/host/useChat";
import { useSelector } from "react-redux";
import { Client as ConversationsClient } from "@twilio/conversations";
import useCommon from "../../hooks/useCommon";
import { BsThreeDotsVertical } from "react-icons/bs";
import ReportBookingModal from "../../components/host/ReportBookingModal";
import { toast } from "react-toastify";

const HostChat = () => {
  const {
    getTwilioToken,
    getChannelUser,
    JoinChannel,
    muteUmuteUser,
    blockUnblockUser,
    archieveUnarchieveUser,
    deleteChatUser,
    reportUser,
    getReportList,
    isLoading,
  } = useChat();
  const { hostMarkBookings } = useCommon();

  const navigate = useNavigate();
  const location = useLocation();
  const senderDetail = location?.state?.sender_detail;
  const property_id = location?.state?.property_id; // it is replace by booking_id

  console.log(senderDetail, "senderDetails *******", property_id);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [showSearch, setShowSearch] = useState(false);
  const [showModal, setShowModal] = useState(false); // For show the dropdown of chat option
  const [showReportForm, setShowReportForm] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState("All Conversations");
  const [twilioToken, setTwilioToken] = useState(null);
  const [lastMessages, setLastMessages] = useState({});
  const [userStatuses, setUserStatuses] = useState({});
  const [getList, setGetList] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [twilioLoading, setTwilioLoading] = useState(false);

  const [selectedBooking, setSelectedBooking] = useState(null);
  const [chatClient, setChatClient] = useState(null); // Fixed state variable

  const [channel, setChannel] = useState(null);
  const [messages, setMessages] = useState([]);

  const [message, setMessage] = useState("");
  //testing
  console.log(messages, "messages list data comes****");

  const userData = JSON.parse(localStorage.getItem(KEYS.USER_INFO));
  const userTypes = localStorage.getItem(KEYS.USER_TYPE);
  const userId = userData?.user_id ? String(userData?.user_id) : null || "";

  const messagesEndRef = React.useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Fetch user list
  // useEffect(() => {
  //   getUserList();
  // }, [senderDetail, userId, userTypes]);

  // const getUserList = async () => {
  //   try {
  //     if (!senderDetail?.user_id && !senderDetail?.host_id) {
  //       // If no sender detail, fetch all users
  //       const response = await getChannelUser({
  //         user_id: String(userId),
  //         type: userTypes,
  //       });
  //       if (response?.data) {
  //         setGetList(response.data);
  //         // setSelectedBooking(response.data?.[response.data.length - 1]);
  //       } else {
  //         setGetList([]);
  //         setSelectedBooking(null);
  //       }
  //     } else {
  //       // If sender detail exists, filter for specific user
  //       const response = await getChannelUser({
  //         user_id: String(userId),
  //         type: userTypes,
  //       });
  //       if (response?.data) {
  //         setGetList(response.data);
  //       }
  //     }
  //   } catch (error) {
  //     setGetList([]);
  //     console.error("Error fetching user list:", error);
  //   }
  // };

  // Filter bookings based on search query
  const filteredBookings = useMemo(() => {
    let filtered = getList || [];

    // Apply search filter
    filtered = filtered.filter((booking) =>
      userTypes == "host"
        ? booking?.sender_name
            ?.toLowerCase()
            .includes(searchQuery?.toLowerCase())
        : booking?.receiver_name
            ?.toLowerCase()
            .includes(searchQuery?.toLowerCase())
    );

    // Apply selected filter logic
    if (selectedFilter == "Archived") {
      filtered = filtered.filter((booking) => booking?.is_archived);
    }

    setShowDropdown(false);
    // Return the filtered array in reverse order
    return filtered;
    // return filtered.reverse();
  }, [getList, searchQuery, selectedFilter]);

  useEffect(() => {
    const markMessagesRead = async () => {
      if (!userData || !userData.user_id) return;

      // Get token for user with correct role
      const response = await getTwilioToken({
        user_id: String(userData.user_id),
        role: userTypes || "host",
      });
      setTwilioToken(response?.data?.token);

      const client = await ConversationsClient.create(response?.data?.token);

      const paginator = await client.getSubscribedConversations();

      for (const convo of paginator.items) {
        // This marks all messages as read
        await convo.setAllMessagesRead();
      }
    };

    markMessagesRead();
  }, []);

  useEffect(() => {
    const markBookingsAsRead = async () => {
      try {
        await hostMarkBookings({ user_id: userId });

        // Set last read count to current unread count
        // setLastReadCount(getList.unread_booking_count);
      } catch (error) {
        console.error("Error marking bookings as read:", error);
      }
    };

    markBookingsAsRead();
  }, []);
  // twilio chat*******
  useEffect(() => {
    let isMounted = true;

    const initializeChat = async () => {
      try {
        // Check for either direct navigation or list selection
        const targetUserId = selectedBooking
          ? userTypes == "host"
            ? selectedBooking.sender_id
            : selectedBooking.receiver_id
          : senderDetail?.user_id || senderDetail?.host_id;
        const targetPropertyId = property_id || selectedBooking?.property_id;

        if (property_id) {
          if (!targetUserId || !targetPropertyId) {
            console.log("Missing required chat parameters");
            return;
          }
        }

        // Get fresh token
        const response = await getTwilioToken({
          user_id: String(userId),
          role: userTypes || "host",
        });

        if (!response?.data?.token) {
          console.error("Failed to get Twilio token");
          return;
        }

        console.log(response?.data?.token, "TOKEN1234***********");

        // Clean up existing client
        if (chatClient) {
          await chatClient.shutdown();
          setChatClient(null);
          setChannel(null);
        }

        // Initialize new client
        const client = new TwilioClient(response?.data?.token);

        client.on("stateChanged", async (state) => {
          if (state == "initialized" && isMounted) {
            setChatClient(client);
            try {
              console.log(
                String(targetUserId),
                String(userId),
                String(targetPropertyId),
                "chat idddddddddd******"
              );
            } catch (error) {
              console.error("Channel creation error:", error);
            }
          }
        });

        client.on("connectionError", (error) => {
          console.error("Twilio connection error:", error);
        });

        client.on("tokenAboutToExpire", async () => {
          try {
            const newToken = await getTwilioToken({
              user_id: String(userId),
              role: userTypes,
            });
            if (newToken?.data?.token) {
              await client.updateToken(newToken.data.token);
            }
          } catch (error) {
            console.error("Token refresh error:", error);
          }
        });
      } catch (error) {
        console.error("Chat initialization error:", error);
      }
    };

    initializeChat();

    return () => {
      isMounted = false;
      if (chatClient) {
        chatClient.shutdown();
      }
    };
  }, [selectedBooking, userId, userTypes, property_id]); // Update dependencies

  // get initilize app

  useEffect(() => {
    if (!chatClient) return;

    console.log(selectedBooking, "Selected booking****");
    const channelName = `ZYVOOPROJ_${Math.min(
      userId,
      senderDetail?.host_id
    )}_${Math.max(userId, senderDetail?.host_id)}_${property_id}`;

    console.log(channelName, "test user");

    const setupConversation = async () => {
      try {
        let convo = await chatClient
          .getConversationByUniqueName(channelName)
          .catch(async () => {
            return await chatClient.createConversation({
              uniqueName: channelName,
            });
          });
        if (senderDetail) {
          const response = await JoinChannel({
            senderId: String(userId),
            receiverId:
              String(senderDetail?.host_id) || String(senderDetail?.user_id),
            groupChannel: channelName,
            userType: String(userTypes),
          });

          if (response) {
            console.log(response, "rrrr");
            fetchUserData();
          }
        }

        const participants = await convo.getParticipants();
        const participantIds = participants.map((p) => p.identity);

        console.log(participantIds, participants, "TEST USER******");

        if (!participantIds.includes(String(userId))) {
          await convo.add(String(userId));
        }
        if (!participantIds.includes(String(senderDetail?.host_id))) {
          await convo.add(String(senderDetail?.host_id));
        }

        convo.on("messageAdded", (msg) => {
          setMessages((prev) => [...prev, msg]);
        });

        const msgs = await convo.getMessages();
        setMessages(msgs.items);
        console.log(msgs, "RES of the message");
        // setConversation(convo);
      } catch (error) {
        console.error("Conversation setup error:", error);
      }
    };

    setupConversation();
  }, [chatClient]);

  //

  // get user list
  const fetchUserData = async () => {
    const response = await getChannelUser({
      user_id: String(userId),
      type: userTypes,
    });

    if (response) {
      console.log("respnse fetch all channel ", response?.data);
      setGetList(response?.data);
    }
  };

  // Update message loading effect
  useEffect(() => {
    if (channel) {
      const loadMessages = async () => {
        setTwilioLoading(true);
        try {
          const messagesResponse = await channel.getMessages(30);
          const processedMessages = await Promise.all(
            messagesResponse.items.map(async (msg) => {
              const messageAuthor = msg.author || userId;
              const baseMsg = {
                ...msg,
                state: {
                  ...msg.state,
                  author: messageAuthor,
                },
                isMyMessage: messageAuthor == userId,
                body: msg.body,
              };

              if (msg.type == "media" && msg.media) {
                try {
                  const mediaUrl = await msg.media.getContentTemporaryUrl();
                  return {
                    ...baseMsg,
                    mediaUrl,
                    type: "media",
                  };
                } catch (error) {
                  console.warn("Error fetching media URL:", error);
                  return {
                    ...baseMsg,
                    type: "text",
                  };
                }
              }
              return {
                ...baseMsg,
                type: "text",
              };
            })
          );

          // Don't reverse here, we'll handle order in the render
          setMessages(processedMessages);
        } catch (error) {
          console.error("Error loading messages:", error);
        }
        setTwilioLoading(false);
      };

      loadMessages();

      // Update real-time message handler
      const messageHandler = async (newMessage) => {
        try {
          // Prevent handling our own messages here since we handle them in sendMessage
          if (newMessage.author == userId) {
            return;
          }

          const messageAuthor = newMessage.author;
          const baseMsg = {
            ...newMessage,
            state: {
              ...newMessage.state,
              author: messageAuthor,
            },
            isMyMessage: false,
            body: newMessage.body,
          };

          if (newMessage.type == "media" && newMessage.media) {
            const mediaUrl = await newMessage.media.getContentTemporaryUrl();
            setMessages((prev) => [
              ...prev,
              {
                ...baseMsg,
                mediaUrl,
                type: "media",
              },
            ]);
          } else {
            setMessages((prev) => [
              ...prev,
              {
                ...baseMsg,
                type: "text",
              },
            ]);
          }
        } catch (error) {
          console.error("Error handling new message:", error);
        }
      };

      channel.on("messageAdded", messageHandler);

      return () => {
        channel.removeListener("messageAdded", messageHandler);
      };
    }
  }, [channel, userId]);

  // Update sendMessage function
  const sendMessage = async (file = null) => {
    if (!channel) {
      console.error("No active channel");
      return;
    }

    try {
      if (file) {
        let tempMessage = null;
        try {
          setTwilioLoading(true);

          tempMessage = {
            type: "media",
            isMyMessage: true,
            state: { author: userId },
            body: "Media message",
            dateCreated: new Date(),
            mediaUrl: URL.createObjectURL(file),
          };

          setMessages((prev) => [...prev, tempMessage]);

          const sentMessage = await channel
            .sendMessage({
              contentType: file.type || "application/octet-stream",
              media: file,
              type: "media",
            })
            .catch((error) => {
              console.error("Error sending media message:", error);
              throw error;
            });

          await new Promise((resolve) => setTimeout(resolve, 2000));

          try {
            if (sentMessage.media) {
              const mediaUrl = await sentMessage.media.getContentTemporaryUrl();
              setMessages((prev) =>
                prev.map((msg) =>
                  msg == tempMessage
                    ? { ...msg, mediaUrl, dateCreated: sentMessage.dateCreated }
                    : msg
                )
              );
            }
          } catch (mediaError) {
            console.error("Error getting media URL:", mediaError);
            // Keep using local URL if permanent URL fails
          }
        } catch (error) {
          console.error("Error sending file:", error);
          // Remove failed message from UI
          if (tempMessage) {
            setMessages((prev) => prev.filter((msg) => msg !== tempMessage));
          }
        } finally {
          setTwilioLoading(false);
          document.getElementById("fileUpload").value = "";
        }
        return;
      }

      if (message.trim()) {
        const messageToSend = message.trim();
        setMessage("");

        try {
          setTwilioLoading(true);
          const sentMessage = await channel
            .sendMessage(messageToSend)
            .catch((error) => {
              console.error("Error sending text message:", error);
              throw error;
            });

          setMessages((prev) => [
            ...prev,
            {
              ...sentMessage,
              body: messageToSend,
              type: "text",
              isMyMessage: true,
              state: { author: userId },
            },
          ]);
        } catch (error) {
          console.error("Failed to send message:", error);
          setMessage(messageToSend); // Restore message if send failed
        } finally {
          setTwilioLoading(false);
        }
      }
    } catch (error) {
      console.error("Message sending error:", error);
      setTwilioLoading(false);
    }
  };

  const handleMuteUnmute = async (data) => {
    const res = await muteUmuteUser({
      user_id: userId,
      group_channel: data?.group_name,
      mute: data?.is_muted == 1 ? 0 : 1,
    });
    if (res?.success) {
      setSelectedBooking((prev) => ({
        ...prev,
        is_muted: data?.is_muted == 1 ? 0 : 1,
      }));
      // getUserList();
    }
  };

  const handleBlockUnblock = async (data) => {
    const res = await blockUnblockUser({
      senderId: userTypes == "host" ? data?.receiver_id : data?.sender_id,
      group_channel: data?.group_name,
      blockUnblock: data?.is_blocked == 0 ? 1 : 0,
    });
    if (res?.success) {
      setSelectedBooking((prev) => ({
        ...prev,
        is_blocked: data?.is_blocked == 0 ? 1 : 0,
      }));
      // getUserList();
    }
  };

  const handleArchieveUnarchieve = async (data) => {
    const res = await archieveUnarchieveUser({
      user_id: userId,
      group_channel: data?.group_name,
    });
    if (res?.success) {
      setSelectedBooking((prev) => ({
        ...prev,
        is_archived: data?.is_archived == 1 ? 0 : 1,
      }));
      // getUserList();
    }
  };

  const handleChatDelete = async (data) => {
    const activeChannel = data?.group_name;

    const res = await deleteChatUser({
      user_id: userTypes == "host" ? data?.receiver_id : data?.sender_id,
      user_type: userTypes,
      group_channel: data?.group_name,
    });
    if (res.success) {
      // getUserList();
      // await activeChannel.delete();
      console.log("Channel deleted successfully!");
      // You might want to update your UI state here, e.g., setChannel(null);
      // and show a success toast.
      toast.success("Chat channel has been permanently deleted.");
    }
  };

  const handleReport = async (data, selectedBooking) => {
    // setShowReportForm(!showReportForm); // Toggle the modal visibility

    if (data?.additionalDetails) {
      const res = await reportUser({
        reporter_id: userId,
        reported_user_id:
          userTypes == "host"
            ? selectedBooking?.sender_id
            : selectedBooking?.receiver_id,
        reason: data?.selectedReason,
        message: data?.additionalDetails,
      });

      if (res.status) {
        // getUserList();
      }
    }
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return "";

    const now = new Date();
    const then = new Date(timestamp);
    const diffInSeconds = Math.floor((now - then) / 1000);

    const minutes = Math.floor(diffInSeconds / 60);
    const hours = Math.floor(diffInSeconds / 3600);
    const days = Math.floor(diffInSeconds / (3600 * 24));
    const months = Math.floor(diffInSeconds / (3600 * 24 * 30));
    const years = Math.floor(diffInSeconds / (3600 * 24 * 365));

    if (years >= 1) return `${years} years ago`;
    if (months >= 1) return `${months} months ago`;
    if (days >= 1) return `${days} days ago`;
    if (hours >= 1) return `${hours} hours ago`;
    if (minutes >= 1) return `${minutes} minutes ago`;

    return "Just now";
  };

  function convertDate(dateStr) {
    const date = new Date(dateStr);
    const day = date.getDate().toString().padStart(2, "0");
    const monthNames = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
  }

  return (
    <>
      {/* <Header /> */}
      {/* <Loader visible={twilioLoading} /> */}
      <div className="container-fluid mt-4">
        <div
          className="d-flex flex-column flex-md-row gap-3"
          style={{ minHeight: "calc(100vh -100px)" }}
        >
          <div
            className="flex-grow"
            style={{
              // backgroundColor: "#f8f9fa",
              borderRadius: "8px",
              padding: "0.5rem",
              overflowY: "auto",
              height: "80vh",
            }}
          >
            {!showSearch ? (
              <div className="d-flex align-items-center justify-content-between">
                <div className="d-flex align-items-center">
                  <div>{selectedFilter}</div>
                  <Dropdown
                    show={showDropdown}
                    onToggle={() => setShowDropdown(!showDropdown)}
                  >
                    <FaCaretDown
                      style={{ cursor: "pointer", marginLeft: 5 }}
                      onClick={() => setShowDropdown(!showDropdown)}
                    />

                    <Dropdown.Menu
                      show
                      align="end"
                      style={{ marginTop: "0.2rem" }}
                    >
                      <Dropdown.Item
                        as="button"
                        onClick={() => setSelectedFilter("All Conversations")}
                      >
                        All Conversations
                      </Dropdown.Item>

                      <Dropdown.Item
                        as="button"
                        onClick={() => setSelectedFilter("Archived")}
                      >
                        Archived
                      </Dropdown.Item>

                      <Dropdown.Item
                        as="button"
                        onClick={() => setSelectedFilter("Unread")}
                      >
                        Unread
                      </Dropdown.Item>
                    </Dropdown.Menu>
                  </Dropdown>
                </div>
                <FaSearch
                  onClick={() => setShowSearch(true)}
                  style={{ marginRight: 20 }}
                />
              </div>
            ) : (
              <InputGroup>
                <FormControl
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />

                <Button
                  variant="outline-secondary"
                  onClick={() => {
                    setShowSearch(false);
                    setSearchQuery("");
                  }}
                >
                  X
                </Button>
              </InputGroup>
            )}

            {filteredBookings?.length > 0 ? (
              filteredBookings.map((booking, index) => (
                <Card
                  key={index}
                  className={`mt-4 ${
                    selectedBooking?.group_name == booking.group_name
                      ? "border border-black"
                      : ""
                  }`}
                  style={{
                    minWidth: "300px",
                    cursor: "pointer",
                    borderRadius: "20px",
                  }}
                  onClick={() => {
                    setSelectedBooking(booking);
                  }}
                >
                  <Card.Body>
                    <div className="d-flex align-items-center">
                      <div
                        style={{
                          width: "55px",
                          height: "55px",
                          borderRadius: "50%",
                          border: "2px solid #ccc",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          overflow: "hidden",
                          backgroundColor: "#fff",
                          marginRight: "10px",
                          position: "relative",
                        }}
                      >
                        <Image
                          src={`${imageBase}${
                            userTypes == "host"
                              ? booking?.sender_profile
                              : booking?.receiver_image
                          }`}
                          roundedCircle
                          className="me-3"
                        />
                        <div
                          style={{
                            position: "absolute",
                            bottom: "4px",
                            right: "4px",
                            width: "20px",
                            height: "20px",
                            borderRadius: "50%",
                            backgroundColor:
                              userStatuses[booking.group_name] == "online"
                                ? "#4AEAB1"
                                : "gray",
                            border: "4px solid white",
                            zIndex: "9999",
                          }}
                          title={userStatuses[booking.group_name]}
                        />
                      </div>
                      <div>
                        <Card.Title style={{ fontSize: "15px" }}>
                          {userTypes == "host"
                            ? booking?.sender_name
                            : booking?.receiver_name}{" "}
                          ({booking?.property_title})
                        </Card.Title>
                        <Card.Subtitle className="mb-2 text-muted">
                          {booking.booking_date}
                        </Card.Subtitle>
                        {lastMessages[booking.group_name]?.timestamp ? (
                          <div style={{ fontSize: "12px", color: "#b9b9b9" }}>
                            🕓{" "}
                            {formatTimeAgo(
                              lastMessages[booking.group_name]?.timestamp
                            ) || ""}
                          </div>
                        ) : (
                          <div style={{ fontSize: "12px", color: "#b9b9b9" }}>
                            Loading...
                          </div>
                        )}
                        {lastMessages[booking.group_name]?.body && (
                          <p
                            style={{
                              fontSize: "14px",
                              marginBottom: "0px",
                              fontWeight: lastMessages[booking.group_name]
                                ?.unread
                                ? "bold"
                                : "normal",
                            }}
                          >
                            💬{" "}
                            {lastMessages[booking.group_name].body.split(" ")
                              .length > 5
                              ? lastMessages[booking.group_name].body
                                  .split(" ")
                                  .slice(0, 3)
                                  .join(" ") + "..."
                              : lastMessages[booking.group_name].body}
                          </p>
                        )}
                      </div>

                      <div
                        style={{
                          position: "absolute",
                          top: "10px",
                          right: "0px",
                        }}
                      >
                        <Col className="d-flex justify-content-end align-items-center">
                          <Dropdown
                            show={activeDropdown == index}
                            onToggle={(isOpen) =>
                              setActiveDropdown(isOpen ? index : null)
                            }
                          >
                            <Dropdown.Toggle
                              className="no-caret"
                              variant="link"
                              id="dropdown-custom-components"
                            >
                              <style>
                                {" "}
                                {` .no-caret::after { display: none !important; }`}{" "}
                              </style>
                              <BsThreeDotsVertical
                                size={26}
                                color="black"
                                style={{ backgroundColor: "white" }}
                              />
                            </Dropdown.Toggle>
                            <Dropdown.Menu>
                              <Dropdown.Item
                                as="button"
                                onClick={() => {
                                  handleMuteUnmute(selectedBooking);
                                }}
                              >
                                {selectedBooking?.is_muted ? "Unmute" : "Mute"}
                              </Dropdown.Item>

                              <Dropdown.Item
                                as="button"
                                onClick={() => {
                                  handleReport(selectedBooking);
                                  setShowReportForm(true);
                                }}
                              >
                                Report
                              </Dropdown.Item>

                              <Dropdown.Item
                                as="button"
                                onClick={() => {
                                  handleChatDelete(selectedBooking);
                                }}
                              >
                                Delete chat
                              </Dropdown.Item>

                              <Dropdown.Item
                                as="button"
                                onClick={() => {
                                  handleBlockUnblock(selectedBooking);
                                }}
                              >
                                {selectedBooking?.is_blocked
                                  ? "Unblock"
                                  : "Block"}
                              </Dropdown.Item>

                              <Dropdown.Item
                                as="button"
                                onClick={() => {
                                  handleArchieveUnarchieve(selectedBooking);
                                }}
                              >
                                {selectedBooking?.is_archived
                                  ? "Unarchived"
                                  : "Archived"}
                              </Dropdown.Item>
                            </Dropdown.Menu>
                          </Dropdown>
                        </Col>
                      </div>
                    </div>
                  </Card.Body>
                </Card>
              ))
            ) : (
              <div className="text-center mt-4">
                <p className="text-muted">No bookings found</p>
              </div>
            )}
            {/* <div
              className="d-flex align-items-center justify-content-between"
              style={{
                border: "1px solid #eee",
                borderRadius: "16px",
                padding: "10px 12px",
                backgroundColor: "#fff",
                minWidth: "300px",
                marginTop: "10px",
                marginBottom: "10px",
                border: "1px solid grey",
              }}
            >
              <div
                style={{
                  width: "50px",
                  height: "50px",
                  borderRadius: "50%",
                  backgroundColor: "#3d4b4f",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "2px solid #fff",
                  marginRight: "12px",
                }} >
                <img src={supportImg} style={{ fontSize: "15px", color: "#fff" }} />
              </div>
              <div className="flex-grow-1" style={{ overflow: "hidden" }}>

                <div className="d-flex justify-content-between align-items-center" style={{ marginBottom: "2px" }} >
                  <span style={{ fontWeight: 600, fontSize: "14px" }}>
                    Support Team
                  </span>
                </div>
                <div style={{ color: "#888", fontSize: "12px" }}>Yesterday</div>
                <div className="text-truncate"
                  style={{
                    fontSize: "13px",
                    color: "#999",
                    maxWidth: "200px",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  Hello can we talk about...
                </div>
              </div>
              <div style={{ marginLeft: "10px", color: "#aaa" }}>
                <i className="bi bi-three-dots-vertical" />
              </div>
            </div> */}
          </div>
          {/* 2nd row */}
          {!selectedBooking ? (
            <div
              className="w-100 mb-4"
              style={{
                flex: "1 0 400px",
                overflowY: "auto",
                minHeight: "calc(100vh -100px)",
              }}
            >
              <Container
                fluid
                className="border border-2 p-3"
                style={{ minWidth: "250px", height: "100%" }}
              >
                <div className="h-100 d-flex justify-content-center align-items-center text-center">
                  Please select a User to chat
                </div>
              </Container>
            </div>
          ) : (
            <div
              className="flex-grow-1"
              style={{
                // backgroundColor: "#e9ecef",
                borderRadius: "8px",
                padding: "0.5rem",
                overflowY: "auto",
                // height: "80vh",
              }}
            >
              <Container className="border border-2 p-3 h-100">
                {/* <Loader visible={isLoading} /> */}
                <Row className="d-flex align-items-center border-bottom">
                  <Col className="d-flex align-items-center">
                    <div
                      style={{
                        width: "55px",
                        height: "55px",
                        borderRadius: "50%",
                        border: "2px solid #ccc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        backgroundColor: "#fff",
                        marginRight: "10px",
                      }}
                    >
                      <Image
                        src={
                          userTypes == "host"
                            ? imageBase + selectedBooking?.sender_profile ||
                              "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJbTOxk5mr0FZbuyX9htlwSpsdBPz-32lyXQ&s"
                            : imageBase + selectedBooking?.receiver_image ||
                              "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJbTOxk5mr0FZbuyX9htlwSpsdBPz-32lyXQ&s"
                        }
                        roundedCircle
                        width="50"
                        height="50"
                      />
                    </div>
                    <div>
                      <h5 style={{}}>
                        {userTypes == "host"
                          ? selectedBooking?.sender_name
                          : selectedBooking?.receiver_name}
                      </h5>
                      <p style={{ color: "#7DD2B0", margin: "0px" }}>
                        {userStatuses[selectedBooking.group_name] == "online"
                          ? "online"
                          : "offline"}
                      </p>
                    </div>
                  </Col>

                  <Col className="d-flex justify-content-end align-items-center">
                    <FaStar size={26} className="me-2" />
                    <Dropdown
                      show={showModal}
                      onToggle={() => setShowModal(!showModal)}
                    >
                      <Dropdown.Toggle
                        className="no-caret"
                        variant="link"
                        id="dropdown-custom-components"
                      >
                        <style>
                          {" "}
                          {` .no-caret::after { display: none !important; }`}{" "}
                        </style>
                        <PiDotsThreeCircleLight size={26} color="black" />
                      </Dropdown.Toggle>

                      <Dropdown.Menu>
                        <Dropdown.Item
                          as="button"
                          onClick={() => {
                            handleMuteUnmute(selectedBooking);
                          }}
                        >
                          {selectedBooking?.is_muted ? "Unmute" : "Mute"}
                        </Dropdown.Item>

                        <Dropdown.Item
                          as="button"
                          onClick={() => {
                            handleReport(selectedBooking);
                            setShowReportForm(true);
                          }}
                        >
                          Report
                        </Dropdown.Item>

                        <Dropdown.Item
                          as="button"
                          onClick={() => {
                            handleChatDelete(selectedBooking);
                          }}
                        >
                          Delete chat
                        </Dropdown.Item>

                        <Dropdown.Item
                          as="button"
                          onClick={() => {
                            handleBlockUnblock(selectedBooking);
                          }}
                        >
                          {selectedBooking?.is_blocked ? "Unblock" : "Block"}
                        </Dropdown.Item>

                        <Dropdown.Item
                          as="button"
                          onClick={() => {
                            handleArchieveUnarchieve(selectedBooking);
                          }}
                        >
                          {selectedBooking?.is_archived
                            ? "Unarchived"
                            : "Archived"}
                        </Dropdown.Item>
                      </Dropdown.Menu>
                    </Dropdown>
                  </Col>
                </Row>
                <Row className="rounded-3 p-3 w-100 ">
                  <Col
                    xs={12}
                    className="mb-3"
                    style={{ height: "250px", overflowY: "auto" }}
                  >
                    {twilioLoading ? (
                      <div
                        className="d-flex justify-content-center align-items-center"
                        style={{ height: "250px" }}
                      >
                        <div
                          className="spinner-border text-primary"
                          role="status"
                        >
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    ) : (
                      <>
                        {messages.map((msg, index) => {
                          const isMyMessage = msg.isMyMessage;
                          const messageDate =
                            msg?.dateCreated ||
                            msg?.state?.timestamp ||
                            new Date();
                          const formattedDate = new Date(
                            messageDate
                          ).toLocaleString();

                          return (
                            <div
                              key={index}
                              className={`d-flex mb-2 ${
                                isMyMessage
                                  ? "justify-content-end"
                                  : "justify-content-start"
                              }`}
                            >
                              {!isMyMessage && (
                                <Image
                                  src={
                                    userTypes == "host"
                                      ? imageBase +
                                          selectedBooking?.sender_profile ||
                                        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJbTOxk5mr0FZbuyX9htlwSpsdBPz-32lyXQ&s"
                                      : imageBase +
                                          selectedBooking?.receiver_image ||
                                        "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJbTOxk5mr0FZbuyX9htlwSpsdBPz-32lyXQ&s"
                                  }
                                  roundedCircle
                                  width="40"
                                  height="40px"
                                  className="me-2"
                                />
                              )}

                              <div
                                className={`d-flex flex-column ${
                                  isMyMessage
                                    ? "align-items-end"
                                    : "align-items-start"
                                }`}
                              >
                                <span
                                  className="text-muted"
                                  style={{ fontSize: "0.8rem" }}
                                >
                                  {formattedDate}
                                </span>

                                {msg.type == "media" ? (
                                  <div
                                    className={`p-2 ${
                                      isMyMessage ? "bg-primary" : "bg-light"
                                    } rounded-3 mt-1`}
                                    style={{ maxWidth: "250px" }}
                                  >
                                    <Image
                                      src={msg.mediaUrl}
                                      alt="Sent media"
                                      width="200"
                                      className="rounded"
                                    />
                                  </div>
                                ) : (
                                  <div
                                    className={`p-2 mt-1 rounded-3 ${
                                      isMyMessage
                                        ? "bg-primary text-white"
                                        : "bg-light"
                                    }`}
                                    style={{ maxWidth: "" }}
                                  >
                                    {msg.body}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </>
                    )}
                  </Col>
                  <Col
                    xs={12}
                    className="p-2"
                    style={{
                      display: "flex",
                      marginBottom: "10%", // Fixed: added a valid margin value
                      // border: "1px solid black",
                    }}
                  >
                    <div
                      className="d-flex align-items-center"
                      style={{ width: "100%" }}
                    >
                      <div
                        className="d-flex align-items-center px-3 flex-grow-1"
                        style={{
                          background: "#f7f7f7",
                          borderRadius: "30px",
                          height: "48px", // This sets the input height
                          marginRight: "0px",
                        }}
                      >
                        <input
                          type="file"
                          id="fileUpload"
                          className="d-none"
                          onChange={(e) => {
                            if (e.target.files.length > 0) {
                              sendMessage(e.target.files[0]);
                              e.target.value = "";
                            }
                          }}
                        />
                        <input
                          type="text"
                          className="form-control border-0 bg-transparent flex-grow-1"
                          placeholder="Type a message..."
                          style={{ boxShadow: "none" }}
                          value={message}
                          onChange={(e) => setMessage(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault(); // Prevent newline
                              if (message.trim()) {
                                sendMessage();
                              }
                            }
                          }}
                        />

                        <label
                          htmlFor="fileUpload"
                          className="ms-2"
                          style={{
                            cursor: "pointer",
                            color: "#555",
                            flexShrink: 0,
                          }}
                        >
                          <ImAttachment />
                        </label>
                      </div>
                      <button
                        className="ms-2 d-flex align-items-center justify-content-center"
                        style={{
                          backgroundColor: "#2ee3a0",
                          border: "none",
                          borderRadius: "50%",
                          width: "40px",
                          height: "40px",
                          color: "#fff",
                          flexShrink: 0,
                        }}
                        onClick={() => sendMessage()}
                        disabled={
                          !message.trim() &&
                          !document.getElementById("fileUpload")?.files?.length
                        }
                      >
                        <LuSend />
                      </button>
                    </div>
                  </Col>
                </Row>
              </Container>
            </div>
          )}
          {/* third row  */}
          {selectedBooking && (
            <div
              className="flex-grow-1"
              style={{
                // backgroundColor: "#dee2e6",
                borderRadius: "8px",
                padding: "1rem",
                overflowY: "auto",
                minHeight: "300px",
                minWidth: "350px",
              }}
            >
              <Container className="border rounded-3">
                <h5 className="mt-3 text-center">
                  {userTypes == "host" ? "Guest by" : "Hosted by"}
                </h5>
                <Row className="m-3 ">
                  <Col
                    xs={8}
                    className="d-flex align-items-center border-bottom border-2 mt-3 w-100 pb-2"
                  >
                    <div
                      style={{
                        width: "55px",
                        height: "55px",
                        borderRadius: "50%",
                        border: "2px solid #ccc",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        backgroundColor: "#fff",
                        marginRight: "10px",
                      }}
                    >
                      <Image
                        src={
                          userTypes == "host"
                            ? imageBase + selectedBooking?.sender_profile
                            : selectedBooking?.receiver_image
                            ? imageBase + selectedBooking?.receiver_image
                            : "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTJbTOxk5mr0FZbuyX9htlwSpsdBPz-32lyXQ&s"
                        }
                        roundedCircle
                        width="50"
                        height="50"
                      />
                    </div>
                    <div>
                      <h6 className="mb-1">
                        {" "}
                        {selectedBooking?.receiver_name}
                      </h6>
                    </div>
                    <FaStar className="text-warning m-1" />{" "}
                    {selectedBooking?.reviews}
                  </Col>
                </Row>
                <Row className="m-3">
                  <Button
                    className="m-1 border border-1 border-black"
                    variant="light"
                    onClick={() =>
                      navigate("/host-listing", {
                        state: { hostId: selectedBooking?.receiver_id },
                      })
                    }
                  >
                    {userTypes == "host" ? "Guest booking" : "Host Properties"}
                  </Button>
                </Row>
                <div className="d-flex justify-content-center mb-3">
                  <PiClockCountdownFill size={24} />
                  <span className="fs-6">Typically respond within 1 hr</span>
                </div>
              </Container>
              <Container className="border rounded-3 w-100 p-3 mt-3">
                <Row>
                  <Col>From</Col>
                  <Col className="text-end fw-bold">
                    {selectedBooking?.receiver_address || "Not Available"}
                    {/* { userData?.user_id == selectedBooking?.sender_id ? (selectedBooking?.sender_address || "Not Available") : userData?.user_id == selectedBooking?.receiver_id ? (selectedBooking?.receiver_address || "Not Available") : "None" } */}
                  </Col>
                </Row>
                <Row>
                  <Col>Member Since</Col>
                  <Col className="text-end">
                    {convertDate(selectedBooking?.receiver_member_since)}
                    {/* {userData?.user_id == selectedBooking?.sender_id ? convertDate(selectedBooking?.sender_member_since) : userData?.user_id == selectedBooking?.receiver_id ? convertDate(selectedBooking?.receiver_member_since) : "None" || "Not Available"} */}
                  </Col>
                </Row>
                <Row>
                  <Col>Language</Col>
                  <Col className="text-end">
                    {selectedBooking?.receiver_language?.join(", ") ||
                      "Not Available"}
                    {/* { userData?.user_id == selectedBooking?.sender_id ? selectedBooking?.sender_language?.join(", ") : userData?.user_id == selectedBooking?.receiver_id ?  selectedBooking?.receiver_language?.join(", ") : "None" || "Not Available"  } */}
                  </Col>

                  {/* <Col>English</Col>
                  <Col className="text-end">Native</Col> */}
                </Row>
              </Container>
            </div>
          )}
        </div>
      </div>
      <ReportBookingModal
        show={showReportForm}
        handleClose={() => setShowReportForm(false)}
        user_id={userId}
        booking_id={selectedBooking?.booking_id}
        property_id={selectedBooking?.property_id}
      />
    </>
  );
};

export default HostChat;

const ReportViolationModal = ({
  showModal,
  handleClose,
  handleReport,
  selectedBooking,
}) => {
  const { getReportList } = useChat();

  const [selectedReason, setSelectedReason] = useState("");
  const [additionalDetails, setAdditionalDetails] = useState("");
  const [reportList, setReportLst] = useState([]);

  useEffect(() => {
    const fetchReportList = async () => {
      const res = await getReportList();
      setReportLst(res?.data);
    };
    fetchReportList();
  }, [getReportList]);

  const handleReasonChange = (event) => {
    setSelectedReason(event.target.value);
  };

  const handleDetailsChange = (event) => {
    setAdditionalDetails(event.target.value);
  };

  const handleSubmit = () => {
    // Prepare the data to send to the parent component
    const reportData = {
      selectedReason,
      additionalDetails,
    };

    // Pass the report data and selectedBooking to the parent component's handleReport function
    handleReport(reportData, selectedBooking);

    // Close the modal after submission
    handleClose();
  };

  return (
    <Modal show={showModal} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Report Violation</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <h5>Please select a reason for reporting this user:</h5>

        {/* Dropdown select for reasons */}
        <Form.Control
          as="select"
          value={selectedReason}
          onChange={handleReasonChange}
        >
          <option value="">Select a reason</option>
          {reportList?.map((item, index) => (
            <option value={item?.value} key={index}>
              {" "}
              {item?.reason}{" "}
            </option>
          ))}
        </Form.Control>

        <h5 className="mt-3">Add Additional Detail:</h5>
        <Form.Control
          as="textarea"
          rows={4}
          value={additionalDetails}
          onChange={handleDetailsChange}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose}>
          Close
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!selectedReason} // Disable submit if no reason is selected
        >
          Submit Report
        </Button>
      </Modal.Footer>
      <p className="mt-3">
        You can also add additional details to help us investigate further.
      </p>
    </Modal>
  );
};
