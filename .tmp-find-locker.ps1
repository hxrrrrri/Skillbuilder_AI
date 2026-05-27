Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'next|prisma|Skillbuilder' } | Select-Object ProcessId, CommandLine | Format-List

