"""empty message

Revision ID: 410e08270de4
Revises: 6bbe0b4a8c4a
Create Date: 2022-04-21 13:40:06.120761

"""
import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "410e08270de4"
down_revision = "6bbe0b4a8c4a"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "event_types",
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.PrimaryKeyConstraint("name", name=op.f("pk_event_types")),
    )
    op.execute(
        """
        INSERT INTO event_types (name) values
        ('project:job:created'),
        ('project:job:started'),
        ('project:job:deleted'),
        ('project:job:cancelled'),
        ('project:job:failed'),
        ('project:job:succeeded')
        ;
        """
    )


def downgrade():
    # ### commands auto generated by Alembic - please adjust! ###
    op.drop_table("event_types")
    # ### end Alembic commands ###
