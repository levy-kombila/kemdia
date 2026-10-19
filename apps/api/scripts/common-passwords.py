#!/usr/bin/env python3
"""Produit src/modules/identity/domain/common-passwords.ts (S7-T07, ASVS 5.0 V6.2.4).

    curl -fsSL -o xato-100k.txt https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/xato-net-10-million-passwords-100000.txt
    python3 apps/api/scripts/common-passwords.py xato-100k.txt > apps/api/src/modules/identity/domain/common-passwords.ts

Garde les 10 000 mots de passe les plus fréquents qui respectent la longueur de Kemdia (8 à 128), en minuscules.
"""
import hashlib
import sys

SOURCE = sys.argv[1]
raw = open(SOURCE, "rb").read()
seen: set[str] = set()
words: list[str] = []
for line in raw.decode("utf-8", errors="replace").splitlines():
    word = line.strip().lower()
    if 8 <= len(word) <= 128 and word.isprintable() and "`" not in word and "\\" not in word and "$" not in word \
            and word not in seen:
        seen.add(word)
        words.append(word)
    if len(words) == 10_000:
        break

print(f"""/**
 * Mots de passe les plus courants (S7-T07, OWASP ASVS 5.0 V6.2.4) : les {len(words)} plus fréquents de la liste
 * « xato-net-10-million-passwords-100000 » qui respectent la règle de longueur de Kemdia (8 à 128), en minuscules.
 *
 * Source : SecLists, https://github.com/danielmiessler/SecLists (Passwords/Common-Credentials), fichier de SHA-256
 * {hashlib.sha256(raw).hexdigest()}.
 * Licence MIT — Copyright (c) 2018 Daniel Miessler.
 *
 * FICHIER PRODUIT par apps/api/scripts/common-passwords.py : ne pas modifier à la main. Vérifié par l'API seulement
 * (rien de plus à télécharger pour les visiteurs du site).
 */
const LIST = `
{chr(10).join(words)}
`;

export const SECLISTS_COMMON_PASSWORDS: ReadonlySet<string> = new Set(LIST.split("\\n").filter(Boolean));""")
