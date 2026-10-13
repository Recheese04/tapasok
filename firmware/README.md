# Tapasok RFID terminal (NodeMCU + RC522)

The `tapasok_rfid` folder is the Arduino sketch for the attendance card reader. It sends card taps to Tapasok at
`https://tapasok-beta.vercel.app`. The wiring is the same as the old BISU terminal, so don't change any wires.

## 1. What you need

- NodeMCU ESP8266 + RC522 reader, wired as before:

  | RC522 | NodeMCU |
  |---|---|
  | SDA | D2 |
  | SCK | D5 |
  | MOSI | D7 |
  | MISO | D6 |
  | RST | D1 |
  | GND | GND |
  | 3.3V | **3V3** (never 5V) |
  | IRQ | not connected |

- Arduino IDE with:
  - the board package **esp8266 by ESP8266 Community**. In *File > Preferences > Additional boards manager URLs*, add
    `https://arduino.esp8266.com/stable/package_esp8266com_index.json`.
  - the library **MFRC522 by GithubCommunity** (Library Manager).
- A 2.4 GHz Wi-Fi network. The ESP8266 can't join 5 GHz networks or captive-portal Wi-Fi (the kind with a login page).

## 2. Get the device key (an officer does this)

1. Sign in to Tapasok as the organization's **President or Secretary**.
2. Go to **Attendance > Records > RFID terminals** and add a terminal, for example "Main entrance reader".
3. Copy the key that appears (it starts with `tpd_`). **It's shown only once.** Send it privately; anyone with it
   can send taps for your organization. If it leaks, revoke the terminal and add a new one.

## 3. Upload

1. Open `tapasok_rfid/tapasok_rfid.ino` (the whole program is this one file; copying its text into a new sketch also works).
2. Fill in `WIFI_SSID`, `WIFI_PASSWORD` and `DEVICE_KEY` at the top.
3. Choose these settings:
   - *Tools > Board*: **NodeMCU 1.0 (ESP-12E Module)**
   - *Tools > CPU Frequency*: **160 MHz** (makes the secure connection faster)
   - the board's COM port
4. Upload, then open the Serial Monitor at **115200** baud with line ending **Newline**.

A good start looks like this:

```
Connected. IP address: 192.168.x.x
Clock set.
RC522 firmware version: 0x92
RC522 reader detected and ready.
[READY] Tap a card on the reader...
```

## 4. Register cards (System Admin)

Open the student's account page in Tapasok and go to **RFID card → Scan RFID card**. Pick this terminal, click
**Scan RFID card**, and tap the card within 60 seconds. The terminal prints `CARD READ FOR REGISTRATION`, and the
page shows the detected UID with the student's name. Click **Confirm registration** to save it. Nothing is saved
before you confirm, and a registration tap never counts as attendance.

If the card already belongs to another student, or the student already has a card, the page asks you to confirm the
move or replacement first. You can also use **Enter UID manually**: tap an unknown card during an event, and the
Serial Monitor prints `Card UID: 04A1B2C3`.

## 5. Take attendance

1. In Tapasok, open the event and the session's **Attendance list**. Make sure the session is **open for check-in**.
2. Copy the page link from the address bar. It ends in `/events/<id>/sessions/<id>`.
3. In the Serial Monitor, type `session ` followed by the link, then press Enter:
   ```
   session https://tapasok-beta.vercel.app/events/.../sessions/...
   ```
   The terminal saves it, so it survives a restart. Set it again for each new session. Type `session clear` to stop.
4. Students tap their cards.

Other commands: `status` (Wi-Fi, clock, reader, session) and `help`.

## What the terminal shows

| Result | Serial Monitor | Blue onboard LED |
|---|---|---|
| Recorded | `RECORDED (PRESENT): Juan` or `(LATE)` | 1 long |
| Already recorded | `ALREADY RECORDED for this session.` | 2 short |
| Card read for registration | `CARD READ FOR REGISTRATION (Juan)` (confirm it on the website) | 3 short |
| Refused | `UNKNOWN CARD`, `NOT RECORDED: <reason>`, `NO SESSION SET`, `REFUSED: the device key…` | 5 fast |
| Network problem | `NOT SENT: network or server problem` | 10 very fast |

If a tap fails because of the network, the terminal retries up to 3 times. It can't record a student twice, because
the server keeps one record per student per session. Tapping the same card again within 2 seconds is ignored.

## Troubleshooting

| Message | Fix |
|---|---|
| `RC522 not responding` | Check 3.3V, GND, SDA→D2, RST→D1 and the SPI wires. |
| `Could not set the clock` | The Wi-Fi blocks internet time (NTP, UDP 123). Use another network or a phone hotspot. Secure connections need the correct date. |
| `TLS: ...` certificate error | Make sure the board's clock was set, and send the full Serial Monitor output to the developer. |
| `REFUSED: the device key…` | The key was mistyped, or the terminal was revoked. |
| `NOT RECORDED: Attendance is not open…` | Open the session in Tapasok, or check its open and close times. |
| `NOT RECORDED: …not on the attendee list` | The student isn't an expected attendee of this event. |

## Optional green LED, red LED and buzzer

These are off by default. To add them, wire them as shown at the top of the sketch (green D0, red D3 active-low,
buzzer through an NPN transistor on D8), then set `#define ENABLE_EXTRA_PARTS 1`. **Wire the red LED exactly as shown**
(3V3 → resistor → LED → D3). D3 and D8 affect how the board starts, so wiring them differently can stop it from booting.

## Limits (please read)

- Cards are identified only by their UID, and a UID can be copied onto another card. Treat the terminal as a
  **supervised prototype**: an officer should watch the terminal during check-in.
- Card numbers from the old Railway system were stored in a different (decimal) format, so they can't be reused.
  Register each card again in Tapasok.
- Taps go to the **live** Tapasok system. Use a test event when trying it out.
