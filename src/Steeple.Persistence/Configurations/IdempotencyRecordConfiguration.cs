using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;

namespace Steeple.Persistence.Configurations;
/// <summary>
/// EF mapping for <see cref="IdempotencyRecord"/> (mirrors 016-idempotency.sql column-for-column).
/// The composite key is the dedup guard itself, so a violation on insert is the expected
/// "someone already spent this key" signal rather than an error.
/// </summary>
public class IdempotencyRecordConfiguration : IEntityTypeConfiguration<IdempotencyRecord>
{
    /// <inheritdoc />
    public void Configure(EntityTypeBuilder<IdempotencyRecord> builder)
    {
        builder.ToTable("idempotency_records");

        builder.HasKey(r => new { r.UserId, r.Scope, r.Key })
            .HasName("PK_idempotency_records");

        builder.Property(r => r.Scope).HasMaxLength(64).IsRequired();

        builder
            .HasOne<User>()
            .WithMany()
            .HasForeignKey(r => r.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
