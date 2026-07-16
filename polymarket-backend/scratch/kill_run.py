import subprocess
import os
import re

try:
    cmd = "wmic process where \"name='python.exe'\" get processid,commandline"
    out = subprocess.check_output(cmd, shell=True).decode(errors='ignore')
    my_pid = os.getpid()
    killed = False
    for line in out.splitlines():
        line_clean = line.strip()
        if 'run.py' in line_clean and not 'kill_run.py' in line_clean:
            m = re.search(r'\b(\d+)\s*$', line_clean)
            if m:
                pid = int(m.group(1))
                if pid != my_pid:
                    print(f"Killing run.py process with PID {pid}")
                    try:
                        os.kill(pid, 9)
                        killed = True
                    except Exception as ex:
                        print(f"Failed to kill {pid}: {ex}")
    if not killed:
        print("No running run.py process found.")
except Exception as e:
    print(f"Error: {e}")
