# Custom n8n image that bundles extra libraries the Code nodes rely on:
#  - exceljs → styled, multi-tab .xlsx (Salla → Odoo workflow)
#  - pdf-lib → remove pages / rebuild PDFs (Salla dedup workflow)
# (PDF text is read by the built-in "Extract from File" node, not in the sandbox.)
FROM docker.n8n.io/n8nio/n8n:latest

USER root

# Install into a location the Code node can resolve.
RUN cd /usr/local/lib/node_modules/n8n && npm install exceljs pdf-lib --no-save

USER node
