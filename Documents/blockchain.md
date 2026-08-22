# Hyperledger Fabric + Pharma Chaincode — Setup Guide

Full setup for running the `pharmacc` chaincode on a local Hyperledger Fabric test network via WSL2 + Docker Desktop on Windows.

## Prerequisites
- Windows 11 with WSL2 (Ubuntu) installed
- Docker Desktop with WSL2 integration enabled
- `fabric-samples` cloned, with your chaincode project at `chaincode-pharma-java`

---

## 1. Install Java (JDK 17)

Gradle 9.x itself needs JVM 17+ to run, even if your chaincode compiles down to an older Java target.

```bash
sudo apt update
sudo apt install -y openjdk-17-jdk
```

Find the install path:

```bash
update-alternatives --list java
```

Set `JAVA_HOME` permanently:

```bash
nano ~/.bashrc
```

Add at the bottom:

```bash
export JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64
export PATH=$JAVA_HOME/bin:$PATH
```

Reload and verify:

```bash
source ~/.bashrc
echo $JAVA_HOME
java -version
```

Check your chaincode's target Java version (JDK 17 can still compile down to 8/11 targets):

```bash
cat build.gradle | grep -i "sourceCompatibility\|targetCompatibility"
```

---

## 2. Fix chaincode template leftovers

Delete old template test files that reference renamed/deleted classes:

```bash
cd ~/fabric-samples/chaincode-pharma-java/src/test/java/org/hyperledger/fabric/samples/assettransfer
rm AssetTransferTest.java
rm AssetTest.java
```

Fix checkstyle "file must end with newline" errors:

```bash
cd ~/fabric-samples/chaincode-pharma-java/src/main/java/org/hyperledger/fabric/samples/assettransfer
echo "" >> PharmaContract.java
echo "" >> Transition.java
```

Test build:

```bash
cd ~/fabric-samples/chaincode-pharma-java
./gradlew clean build
```

---

## 3. WSL2 memory allocation (if Docker crashes mid-build)

Chaincode Docker builds are memory-hungry. If containers crash under low RAM, edit `.wslconfig` **from Windows PowerShell** (not WSL):

```powershell
notepad "$env:USERPROFILE\.wslconfig"
```

Add:

```ini
[wsl2]
memory=6GB
processors=4
```

Restart WSL:

```powershell
wsl --shutdown
```

---

## 4. Free up disk space (Dell SupportAssist bug)

If Docker Desktop won't start or segfaults, check disk space first — Dell SupportAssist's `SARemediation` snapshots are a known culprit that can silently consume 80GB+.

**Diagnose (PowerShell, run as Administrator):**

```powershell
Get-ChildItem "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots" -Directory | ForEach-Object {
    $size = (Get-ChildItem $_.FullName -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1GB
    "{0}: {1:N2} GB" -f $_.Name, $size
}
```

**If access is denied even as Administrator, take ownership first:**

```powershell
takeown /f "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots" /r /d y
icacls "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots" /grant Administrators:F /t /c
```

**Delete the offending folders:**

```powershell
Remove-Item "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots\Backup" -Recurse -Force
Remove-Item "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots\1781859426-Backup" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots\1782337039-Backup" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots\Temp" -Recurse -Force -ErrorAction SilentlyContinue
```

> If `Remove-Item` fails with "Access denied" on a `.sys` file inside a deeply nested folder, that's usually a **long path name** issue, not permissions. Use the robocopy empty-mirror trick instead:
> ```powershell
> mkdir C:\Empty -Force
> robocopy C:\Empty "C:\ProgramData\Dell\SARemediation\SystemRepair\Snapshots\Backup" /MIR
> Remove-Item C:\Empty -Force
> ```

**Verify freed space:**

```powershell
Get-PSDrive C
```

---

## 5. Fix Docker's internal DNS (if image pulls fail with "no such host")

Symptom: `docker build failed ... failed to resolve reference ... no such host`.

**Test it:**

```bash
docker run --rm busybox nslookup registry-1.docker.io
```

**Fix — Docker Desktop → Settings → Docker Engine → merge into the JSON config:**

```json
{
  "builder": {
    "gc": {
      "defaultKeepStorage": "20GB",
      "enabled": true
    }
  },
  "experimental": false,
  "dns": ["8.8.8.8", "1.1.1.1"]
}
```

Click **Apply & Restart**, then re-test:

```bash
docker run --rm busybox nslookup registry-1.docker.io
```

---

## 6. Start the network (every time, after a reboot)

1. Open **Docker Desktop** on Windows, wait for "Docker Desktop is running."
2. Open **Ubuntu (WSL)** terminal.
3. Confirm Docker is reachable from WSL:

```bash
docker ps -a
```

4. Bring the Fabric test network up clean and create the channel:

```bash
cd ~/fabric-samples/test-network
./network.sh down
./network.sh up createChannel -c mychannel -ca
```

Wait for `Channel 'mychannel' joined` for both peers.

---

## 7. Deploy the chaincode

```bash
cd ~/fabric-samples/test-network
./network.sh deployCC -ccn pharmacc -ccp ../chaincode-pharma-java -ccl java
```

Success looks like:

```
Chaincode definition committed on channel 'mychannel'
Committed chaincode definition for chaincode 'pharmacc' on channel 'mychannel':
Version: 1.0, Sequence: 1, Endorsement Plugin: escc, Validation Plugin: vscc, Approvals: [Org1MSP: true, Org2MSP: true]
```

---

## 8. Verify everything is running

```bash
docker ps -a
```

You should see (all `Up`):
- `orderer.example.com`
- `peer0.org1.example.com`
- `peer0.org2.example.com`
- `ca_org1`, `ca_org2`, `ca_orderer`
- `dev-peer0.org1.example.com-pharmacc_1.0-...`
- `dev-peer0.org2.example.com-pharmacc_1.0-...`

---

## 9. Set CLI environment to interact with the chaincode (Org1)

```bash
cd ~/fabric-samples/test-network
export PATH=${PWD}/../bin:$PATH
export FABRIC_CFG_PATH=$PWD/../config/
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE=${PWD}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
export CORE_PEER_MSPCONFIGPATH=${PWD}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
export CORE_PEER_ADDRESS=localhost:7051
```

From here, use `peer chaincode invoke` / `peer chaincode query` with your contract's actual function names.

---

## 10. Shutting everything down cleanly

**Stop the Fabric network containers (from inside WSL):**

```bash
cd ~/fabric-samples/test-network
./network.sh down
```

This stops and removes all Fabric containers, networks, and volumes — safer than just closing terminals.

**Exit WSL:**

```bash
exit
```

**Shut down WSL entirely (from Windows PowerShell, not WSL):**

```powershell
wsl --shutdown
```

**Quit Docker Desktop:**

Right-click the Docker Desktop icon in the Windows system tray → **Quit Docker Desktop** (closing the window alone leaves it running in the background).

**Verify nothing's left running:**

```powershell
wsl -l -v
```

Should show your Ubuntu distro as `Stopped`.

Next session, just reopen Docker Desktop + Ubuntu terminal and pick back up from Step 6.

---

## Notes
- Ports: orderer `7050`, peer0.org1 `7051`, peer0.org2 `9051`, ca_org1 `7054`, ca_org2 `8054`, ca_orderer `9054`.
- If Docker crashes or behaves oddly again, check disk space (Step 4) and DNS (Step 5) first — both caused real failures during this setup.
- `./network.sh down` wipes all crypto material and containers — always follow it with `up createChannel` before `deployCC`.
