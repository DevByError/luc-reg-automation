"""Makes the sample documents the portal shows in sample mode.

Every file is clearly marked SAMPLE and holds made-up values only.
Run:  python scripts/make-samples.py   (needs reportlab and Pillow)
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

OUT = Path(__file__).resolve().parent.parent / "public" / "samples"
OUT.mkdir(parents=True, exist_ok=True)
W, H = A4
INK = HexColor("#0f172a")
MUTED = HexColor("#475569")
LINE = HexColor("#cbd5e1")
FOOTER = "Sample document for testing the portal. Not a real record."


def page_frame(c, page, pages):
    c.saveState()
    c.setFillColor(Color(0.85, 0.87, 0.9, alpha=0.35))
    c.setFont("Helvetica-Bold", 110)
    c.translate(W / 2, H / 2)
    c.rotate(35)
    c.drawCentredString(0, -30, "SAMPLE")
    c.restoreState()
    c.setFont("Helvetica", 8)
    c.setFillColor(MUTED)
    c.drawString(40, 28, FOOTER)
    c.drawRightString(W - 40, 28, f"Page {page} of {pages}")


def title(c, y, text, size=15):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", size)
    c.drawCentredString(W / 2, y, text)
    return y - size - 10


def heading(c, y, text):
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(50, y, text)
    c.setStrokeColor(LINE)
    c.line(50, y - 5, W - 50, y - 5)
    return y - 24


def row(c, y, label, value, x=50, label_w=170):
    c.setFont("Helvetica", 10)
    c.setFillColor(MUTED)
    c.drawString(x, y, label)
    c.setFillColor(INK)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(x + label_w, y, value)
    return y - 18


def paragraph(c, y, text, size=10, x=50, width=95):
    import textwrap

    c.setFont("Helvetica", size)
    c.setFillColor(INK)
    for line in textwrap.wrap(text, width):
        c.drawString(x, y, line)
        y -= size + 5
    return y - 6


def registration_form():
    c = canvas.Canvas(str(OUT / "registration-form.pdf"), pagesize=A4)
    c.setTitle("Registration form (sample)")
    # Page 1
    page_frame(c, 1, 2)
    y = H - 70
    y = title(c, y, "INTERNATIONAL STUDENT REGISTRATION FORM")
    c.setFont("Helvetica", 9)
    c.setFillColor(MUTED)
    c.drawCentredString(W / 2, y + 4, "Sample layout for testing only")
    y -= 24
    y = heading(c, y, "Documents required")
    for item in [
        "Photo with white background (4 copies, 45 mm x 35 mm)",
        "Certified true copy of results and certificates",
        "Other supporting documents where applicable",
    ]:
        c.setFont("Helvetica", 10)
        c.setFillColor(INK)
        c.drawString(60, y, "•  " + item)
        y -= 16
    y -= 14
    # Official use box
    box_top = y
    c.setStrokeColor(INK)
    c.setLineWidth(1)
    c.rect(50, box_top - 120, W - 100, 120)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(60, box_top - 16, "FOR OFFICIAL USE ONLY")
    yy = box_top - 38
    yy = row(c, yy, "LUC Application", "LUC0000123", x=60, label_w=150)
    yy = row(c, yy, "Student ID", "", x=60, label_w=150)
    yy = row(c, yy, "Intake", "", x=60, label_w=150)
    yy = row(c, yy, "Representative ID", "", x=60, label_w=150)
    yy = row(c, yy, "EMGS Approval Type", "eng", x=60, label_w=150)
    y = box_top - 150
    y = heading(c, y, "1. Application & Program Details")
    y = row(c, y, "Program Name", "Bachelor of Science (Honours) in Hospitality Management")
    y = row(c, y, "Faculty", "Sample Faculty")
    y = row(c, y, "Student Name", "SAMPLE STUDENT")
    c.showPage()

    # Page 2
    page_frame(c, 2, 2)
    y = H - 70
    y = heading(c, y, "1.1 Contact details")
    y = row(c, y, "Address", "1 Sample Road, Sample City")
    y = row(c, y, "State / Province", "Sample State")
    y = row(c, y, "Country", "Sampleland")
    y = row(c, y, "Mobile number", "+60 12 000 0000")
    y = row(c, y, "Home number", "+000 1111 2222")
    y = row(c, y, "Email", "student@example.com")
    y -= 16
    y = heading(c, y, "1.2 Emergency contact details in home country")
    y = row(c, y, "Name", "SAMPLE PARENT")
    y = row(c, y, "Relationship", "Father")
    y = row(c, y, "Address", "1 Sample Road, Sample City, Sampleland")
    y = row(c, y, "Contact No", "+000 3333 4444")
    y = row(c, y, "Email", "parent@example.com")
    c.showPage()
    c.save()


def simple_doc(filename, doc_title, rows, body=None, top_ref=None):
    c = canvas.Canvas(str(OUT / filename), pagesize=A4)
    c.setTitle(doc_title + " (sample)")
    page_frame(c, 1, 1)
    y = H - 60
    if top_ref:
        c.setFont("Helvetica", 10)
        c.setFillColor(INK)
        for label, value in top_ref:
            c.drawString(50, y, f"{label} {value}")
            y -= 16
        y -= 24
    y = title(c, y, doc_title.upper())
    y -= 10
    for label, value in rows:
        y = row(c, y, label, value)
    if body:
        y -= 12
        for p in body:
            y = paragraph(c, y, p)
    c.showPage()
    c.save()


def stamp_png():
    img = Image.new("RGB", (1400, 900), (247, 245, 238))
    d = ImageDraw.Draw(img)
    try:
        big = ImageFont.truetype("DejaVuSans-Bold.ttf", 64)
        mid = ImageFont.truetype("DejaVuSans-Bold.ttf", 36)
        small = ImageFont.truetype("DejaVuSans.ttf", 28)
    except OSError:
        big = mid = small = ImageFont.load_default()
    for x in range(0, 1400, 28):
        d.line([(x, 0), (x, 900)], fill=(240, 237, 228))
    d.rounded_rectangle([170, 170, 1230, 730], radius=28, outline=(37, 70, 160), width=10)
    d.rounded_rectangle([200, 200, 1200, 700], radius=20, outline=(37, 70, 160), width=3)
    d.text((700, 300), "SAMPLE VISA STAMP", fill=(37, 70, 160), font=big, anchor="mm")
    d.text((700, 410), "Visa No: SAMPLE-0000", fill=(37, 70, 160), font=mid, anchor="mm")
    d.text((700, 470), "Valid until: 01/01/2027", fill=(37, 70, 160), font=mid, anchor="mm")
    d.text((700, 600), "Not a real document. For testing the portal only.", fill=(90, 90, 90), font=small, anchor="mm")
    img.save(OUT / "stamp-sample.png", optimize=True)


if __name__ == "__main__":
    registration_form()
    simple_doc(
        "english-certificate.pdf",
        "English proficiency certificate",
        [("Name", "SAMPLE STUDENT"), ("Test", "Sample English Test"), ("Overall result", "6.0"), ("Date", "01/06/2026")],
        ["This sample certificate stands in for the file the tool downloads from Applicant Details [All]."],
    )
    simple_doc(
        "student-profile.pdf",
        "Student Profile and Family Details",
        [
            ("Name", "SAMPLE STUDENT"),
            ("Program", "Bachelor of Science (Honours) in Hospitality Management"),
            ("Nationality", "Sampleland"),
            ("Father", "SAMPLE PARENT"),
            ("Mother", "SAMPLE PARENT TWO"),
            ("Home address", "1 Sample Road, Sample City"),
        ],
    )
    simple_doc(
        "student-type.pdf",
        "Student Type Document",
        [("Name", "SAMPLE STUDENT"), ("Student type", "Normal Student"), ("Approval type", "eng")],
        ["This sample stands in for row 10 of section 1 in the student's documents."],
    )
    simple_doc(
        "val-letter.pdf",
        "Visa approval letter",
        [("Student", "SAMPLE STUDENT"), ("Institution", "Sample Institution"), ("Program", "Bachelor of Science (Honours)")],
        [
            "This sample stands in for the VAL letter opened from the Approval link in section 7.",
            "The staff copies the Our Ref. line at the top into Last Visa Reference No.",
        ],
        top_ref=[("Our Ref.:", "SAMPLE/STU/0000/00/1"), ("Date:", "01/10/2026")],
    )
    simple_doc(
        "holding-letter.pdf",
        "Student passport holding letter",
        [("Student", "SAMPLE STUDENT"), ("Passport type", "New(Year 1)"), ("Remarks", "Student Visa")],
        ["This sample stands in for the letter the site shows after Submit on Passport Collection."],
    )
    stamp_png()
    for f in sorted(OUT.iterdir()):
        print(f.name, f.stat().st_size)
